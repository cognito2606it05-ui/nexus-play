# NEXUS Play - Production Build & Deployment Setup

## 🐳 Docker Configuration

### **Dockerfile.api** (Node.js Backend)

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    nginx \
    curl \
    bash

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Build TypeScript (if using TS)
RUN npm run build

# Expose ports
EXPOSE 5000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
```

### **Dockerfile.streaming** (FFmpeg + NGINX-RTMP)

```dockerfile
FROM jrottenberg/ffmpeg:4.4-alpine

WORKDIR /app

# Install NGINX with RTMP module
RUN apk add --no-cache nginx alpine-sdk pcre-dev zlib-dev openssl-dev

# Build NGINX with RTMP module
RUN mkdir -p /tmp/nginx && cd /tmp/nginx && \
    wget http://nginx.org/download/nginx-1.21.0.tar.gz && \
    tar xzf nginx-1.21.0.tar.gz && \
    git clone https://github.com/arut/nginx-rtmp-module.git && \
    cd nginx-1.21.0 && \
    ./configure --prefix=/etc/nginx \
                --sbin-path=/usr/sbin/nginx \
                --add-module=../nginx-rtmp-module && \
    make && make install

# Copy NGINX config
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/rtmp.conf /etc/nginx/rtmp.conf

# Copy startup script
COPY scripts/start-streaming.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/start-streaming.sh

# Create necessary directories
RUN mkdir -p /mnt/hls /mnt/dash /var/log/nginx

EXPOSE 1935 8080

CMD ["/usr/local/bin/start-streaming.sh"]
```

### **docker-compose.yml** (Complete Stack)

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: nexus-postgres
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - nexus-network
    restart: unless-stopped

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: nexus-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - nexus-network
    restart: unless-stopped

  # Node.js API Server
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: nexus-api
    environment:
      NODE_ENV: production
      PORT: 5000
      DB_HOST: postgres
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: ${DB_NAME}
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      API_KEY_STRIPE: ${API_KEY_STRIPE}
      FIREBASE_CONFIG: ${FIREBASE_CONFIG}
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    networks:
      - nexus-network
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Live Streaming Service (NGINX-RTMP + FFmpeg)
  streaming:
    build:
      context: .
      dockerfile: Dockerfile.streaming
    container_name: nexus-streaming
    environment:
      RTMP_PORT: 1935
      HLS_PORT: 8080
      NGINX_WORKER_PROCESSES: 4
    ports:
      - "1935:1935"
      - "8080:8080"
    volumes:
      - ./streaming/hls:/mnt/hls
      - ./streaming/dash:/mnt/dash
      - ./nginx/rtmp.conf:/etc/nginx/rtmp.conf
      - ./logs/nginx:/var/log/nginx
    networks:
      - nexus-network
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Elasticsearch (Optional - for search)
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
    container_name: nexus-elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms256m -Xmx256m"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    networks:
      - nexus-network
    restart: unless-stopped

  # NGINX Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: nexus-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf
      - ./dist/web:/usr/share/nginx/html
      - ./nginx/ssl:/etc/nginx/ssl
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - api
      - streaming
    networks:
      - nexus-network
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:

networks:
  nexus-network:
    driver: bridge
```

---

## 📋 Configuration Files

### **.env.production**

```bash
# Application
NODE_ENV=production
PORT=5000
API_URL=https://api.nexus-play.com
FRONTEND_URL=https://nexus-play.com

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=nexus_user
DB_PASSWORD=your-secure-password-here
DB_NAME=nexus_production

# Redis
REDIS_URL=redis://redis:6379

# JWT & Security
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
REFRESH_TOKEN_SECRET=your-refresh-token-secret
JWT_EXPIRE=7d

# Streaming
RTMP_SERVER=rtmp://streaming:1935/live
HLS_URL=https://stream.nexus-play.com/hls
DASH_URL=https://stream.nexus-play.com/dash

# Firebase
FIREBASE_API_KEY=your-firebase-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id

# AWS/CDN (Backblaze B2)
B2_ACCOUNT_ID=your-b2-account-id
B2_APPLICATION_KEY=your-b2-app-key
B2_BUCKET_ID=your-bucket-id
B2_BUCKET_NAME=nexus-play-videos

# Email Service (SendGrid)
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@nexus-play.com

# News APIs
NEWS_API_KEY=your-newsapi-key
GUARDIAN_API_KEY=your-guardian-key

# Stripe (Payments)
STRIPE_SECRET_KEY=sk_live_your-key
STRIPE_PUBLISHABLE_KEY=pk_live_your-key

# Logging & Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

### **nginx/default.conf** (Reverse Proxy)

```nginx
# Upstream services
upstream api_server {
    server api:5000;
    keepalive 32;
}

upstream streaming_server {
    server streaming:8080;
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=stream_limit:10m rate=50r/s;

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nexus-play.com www.nexus-play.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # CORS Headers
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json application/javascript;
    gzip_vary on;

    # Cache Static Assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        root /usr/share/nginx/html;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Web Frontend (SPA)
    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
        expires 1d;
        add_header Cache-Control "public, must-revalidate";
    }

    # API Endpoints
    location /api/ {
        limit_req zone=api_limit burst=10 nodelay;
        proxy_pass http://api_server/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://api_server/health;
    }

    # Live Streaming - HLS
    location /stream/ {
        limit_req zone=stream_limit burst=100 nodelay;
        proxy_pass http://streaming_server/;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # HLS Playlists (cache 10 seconds)
    location ~ \.m3u8$ {
        proxy_pass http://streaming_server;
        expires 10s;
        add_header Cache-Control "public, must-revalidate";
        add_header X-Accel-Buffering "no";
    }

    # HLS Segments (cache 1 hour)
    location ~ \.ts$ {
        proxy_pass http://streaming_server;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # DASH Manifests
    location ~ \.mpd$ {
        proxy_pass http://streaming_server;
        expires 10s;
        add_header Cache-Control "public, must-revalidate";
    }

    # DASH Segments
    location ~ \.m4s$ {
        proxy_pass http://streaming_server;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # 404 for missing resources
    error_page 404 /index.html;
}
```

### **nginx/rtmp.conf** (Live Streaming Config)

```nginx
rtmp {
    server {
        listen 1935;
        chunk_size 4000;

        # Live application
        application live {
            live on;
            record off;

            # HLS output
            hls on;
            hls_path /mnt/hls;
            hls_fragment 5s;
            hls_playlist_length 30s;
            hls_continuous on;
            hls_cleanup on;
            hls_nested on;

            # DASH output
            dash on;
            dash_path /mnt/dash;
            dash_fragment 5s;
            dash_playlist_length 30s;

            # Publish restrictions
            allow publish 127.0.0.1;
            deny publish all;

            # Allow play from anywhere
            allow play all;

            # Record if needed
            record all;
            record_path /mnt/recordings;
            record_suffix -%d-%b-%y-%H:%M:%S.flv;

            # Transcoding example
            exec /usr/local/bin/ffmpeg -i rtmp://localhost/$app/$name \
                -c:v libx264 -preset vfast -b:v 1000k -maxrate 1000k -bufsize 2000k \
                -c:a aac -b:a 128k -f flv rtmp://localhost/live_converted/$name;
        }

        # Converted streams
        application live_converted {
            live on;
            record off;
        }
    }
}
```

---

## 🚀 Deployment Scripts

### **build.sh** (Complete Build Process)

```bash
#!/bin/bash

set -e

echo "🚀 Starting NEXUS Play Production Build..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Build function
build_component() {
    local component=$1
    echo -e "${BLUE}Building $component...${NC}"
    
    case $component in
        "web")
            cd web
            npm run build
            cd ..
            echo -e "${GREEN}✓ Web build complete${NC}"
            ;;
        "android")
            cd mobile
            npm run build:android
            cd ..
            echo -e "${GREEN}✓ Android APK/AAB complete${NC}"
            ;;
        "ios")
            cd mobile
            npm run build:ios
            cd ..
            echo -e "${GREEN}✓ iOS IPA complete${NC}"
            ;;
        "api")
            cd api
            npm run build
            cd ..
            echo -e "${GREEN}✓ API build complete${NC}"
            ;;
        "docker")
            echo "Building Docker images..."
            docker-compose build --no-cache
            echo -e "${GREEN}✓ Docker images built${NC}"
            ;;
    esac
}

# Parse arguments
BUILD_ALL=false
COMPONENTS=()

if [ "$#" -eq 0 ]; then
    BUILD_ALL=true
else
    for arg in "$@"; do
        COMPONENTS+=("$arg")
    done
fi

# Execute builds
if [ "$BUILD_ALL" = true ]; then
    build_component "web"
    build_component "android"
    build_component "ios"
    build_component "api"
    build_component "docker"
else
    for component in "${COMPONENTS[@]}"; do
        build_component "$component"
    done
fi

echo -e "${GREEN}✓ Build complete! Check dist/ folder${NC}"
```

### **deploy.sh** (Hostinger Deployment)

```bash
#!/bin/bash

set -e

HOSTINGER_USER="your_username"
HOSTINGER_HOST="your-hostinger-server.com"
HOSTINGER_PATH="/home/nexus-play"

echo "🚀 Deploying NEXUS Play to Hostinger..."

# Build first
./build.sh api docker

# Connect and deploy
ssh $HOSTINGER_USER@$HOSTINGER_HOST << 'REMOTE_COMMANDS'
    cd $HOSTINGER_PATH
    
    # Stop running containers
    docker-compose down
    
    # Pull latest code
    git pull origin main
    
    # Install dependencies
    npm install --production
    
    # Build API
    npm run build
    
    # Start containers
    docker-compose up -d
    
    # Verify health
    sleep 10
    curl http://localhost:5000/health
    
    echo "✓ Deployment successful!"
REMOTE_COMMANDS

echo "✓ NEXUS Play deployed successfully!"
echo "🌐 Access at: https://nexus-play.com"
```

### **deploy-mobile.sh** (App Store Submission)

```bash
#!/bin/bash

echo "📱 Preparing mobile apps for store submission..."

# Android Play Store
echo "🔵 Building Android AAB..."
cd mobile
./gradlew bundleRelease
# Upload to: Google Play Console

# iOS App Store
echo "🍎 Building iOS IPA..."
xcodebuild -workspace ios/NexusPlay.xcworkspace \
    -scheme NexusPlay \
    -configuration Release \
    -archivePath ./ios/NexusPlay.xcarchive archive

xcodebuild -exportArchive \
    -archivePath ./ios/NexusPlay.xcarchive \
    -exportOptionsPlist ./ios/ExportOptions.plist \
    -exportPath ./dist/mobile/ios

# Upload to: App Store Connect
echo "✓ Ready for app store submission!"
```

---

## 📊 Monitoring & Logging Setup

### **docker-compose-monitoring.yml** (Optional)

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    networks:
      - nexus-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - nexus-network

  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./monitoring/loki-config.yml:/etc/loki/local-config.yml
      - loki_data:/loki
    networks:
      - nexus-network

volumes:
  prometheus_data:
  grafana_data:
  loki_data:
```

---

## ✅ Pre-Launch Checklist

- [ ] All docker containers start and stay healthy
- [ ] Database migrations run successfully
- [ ] API endpoints respond with 200 status
- [ ] SSL/TLS certificate is valid
- [ ] Video streaming works on all bitrates
- [ ] Reels feed loads within 3 seconds
- [ ] News updates every 5 minutes
- [ ] User authentication works across devices
- [ ] Backups are running daily
- [ ] Monitoring alerts configured
- [ ] Error logging to Sentry/DataDog
- [ ] Performance metrics baseline established
- [ ] Load testing passed (1000+ concurrent users)
- [ ] Security audit completed
- [ ] GDPR/Privacy compliance verified

---

## 🔧 Post-Deployment

```bash
# Monitor logs
docker-compose logs -f api

# Check health
curl https://nexus-play.com/health

# View database
psql -h localhost -U nexus_user -d nexus_production

# Clear cache
docker exec nexus-redis redis-cli FLUSHALL

# Scale API servers (if needed)
docker-compose up -d --scale api=3
```

Good luck! 🎉
