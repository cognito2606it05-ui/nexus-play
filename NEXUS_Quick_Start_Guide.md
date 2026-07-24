# NEXUS Play - Quick Start Guide

## 🚀 Getting Started in 10 Steps

### Prerequisites
- Node.js 18+ installed
- Docker & Docker Compose installed
- Git installed
- Hostinger hosting plan with SSH access
- FFmpeg installed locally (for testing streaming)

---

## 📝 Step 1: Project Setup (5 minutes)

```bash
# Clone repository
git clone <your-repo-url>
cd nexus-play

# Install all dependencies
npm run install:all

# Copy environment files
cp .env.example .env.development
cp .env.example .env.production
```

### Edit `.env.development`
```bash
NODE_ENV=development
PORT=5000
API_URL=http://localhost:5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=nexus_dev
DB_PASSWORD=dev_password
DB_NAME=nexus_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-dev-secret-key-min-32-chars
```

---

## 🏗️ Step 2: Local Database Setup (10 minutes)

```bash
# Using Docker
docker run --name nexus-postgres \
  -e POSTGRES_USER=nexus_dev \
  -e POSTGRES_PASSWORD=dev_password \
  -e POSTGRES_DB=nexus_dev \
  -p 5432:5432 \
  -d postgres:15-alpine

# Using Docker Compose (recommended)
docker-compose up -d postgres redis

# Run migrations
cd api
npm run db:migrate
npm run db:seed
cd ..
```

---

## 💻 Step 3: Start Development Servers (2 minutes)

**Terminal 1 - Web Frontend**
```bash
cd web
npm run dev
# Runs on http://localhost:5173
```

**Terminal 2 - API Server**
```bash
cd api
npm run dev
# Runs on http://localhost:5000
```

**Terminal 3 - Mobile (Optional)**
```bash
cd mobile
npm start
# Choose 'a' for Android or 'i' for iOS
```

---

## 📱 Step 4: Test on Mobile Devices

### Android Emulator
```bash
# List available emulators
emulator -list-avds

# Start emulator
emulator -avd Pixel_5_API_31

# Run app on emulator
npm run android
```

### iOS Simulator
```bash
# List available simulators
xcrun simctl list devices

# Run app on simulator
npm run ios
```

### Physical Device Testing
```bash
# Get device IP
ipconfig getifaddr en0  # macOS
# or
hostname -I  # Linux

# Connect to local API (update in app config)
API_URL=http://<YOUR_IP>:5000

# Start dev server on all interfaces
npm run dev -- --host 0.0.0.0
```

---

## 🏢 Step 5: Live Streaming Setup (15 minutes)

### Start NGINX RTMP Server (Docker)
```bash
docker run --name nginx-rtmp \
  -p 1935:1935 \
  -p 8080:8080 \
  -v $(pwd)/nginx/rtmp.conf:/etc/nginx/rtmp.conf \
  -d tiangolo/nginx-rtmp
```

### Test RTMP Ingest
```bash
# Using FFmpeg to push test stream
ffmpeg -f lavfi -i testsrc=size=1280x720:duration=60 \
  -f lavfi -i sine=frequency=1000:duration=60 \
  -pix_fmt yuv420p -c:v libx264 -b:v 1000k \
  -c:a aac -b:a 128k -f flv rtmp://localhost:1935/live/test
```

### View HLS Stream
```
http://localhost:8080/live/test.m3u8
```

### Play in VLC or Web Player
```bash
# VLC: File → Open Network Stream → 
# http://localhost:8080/live/test.m3u8

# Or in browser with HLS.js
<video id="video" controls width="640" height="360"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  var video = document.getElementById('video');
  var hls = new Hls();
  hls.loadSource('http://localhost:8080/live/test.m3u8');
  hls.attachMedia(video);
</script>
```

---

## 📦 Step 6: Build Production Bundle (10 minutes)

```bash
# Build all components
npm run build:all

# Or individually
npm run build:web
npm run build:api
npm run build:mobile

# Check output
ls -la dist/
```

---

## ☁️ Step 7: Deploy to Hostinger (20 minutes)

### Connect to Hostinger
```bash
# SSH into server
ssh username@your-hostinger-server.com

# Create app directory
mkdir -p ~/nexus-play
cd ~/nexus-play
```

### Upload Files
```bash
# From local machine
scp -r dist/web/* username@your-server.com:~/nexus-play/web/
scp -r dist/api/* username@your-server.com:~/nexus-play/api/
scp docker-compose.yml username@your-server.com:~/nexus-play/
scp .env.production username@your-server.com:~/nexus-play/
scp -r nginx/ username@your-server.com:~/nexus-play/
```

### On Hostinger Server
```bash
cd ~/nexus-play

# Install Node.js (if not available)
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install dependencies
cd api && npm install --production && cd ..

# Setup SSL certificate
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d nexus-play.com

# Configure Nginx
sudo cp nginx/default.conf /etc/nginx/sites-available/nexus-play
sudo ln -s /etc/nginx/sites-available/nexus-play /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Start API with PM2
pm2 start api/dist/index.js --name "nexus-api"
pm2 save
pm2 startup

# Verify deployment
curl https://nexus-play.com/health
```

---

## 🐳 Step 8: Docker Deployment (Alternative)

```bash
# Build Docker images on Hostinger
docker-compose build

# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f api

# Health check
docker-compose ps
```

---

## ✅ Step 9: Verify Everything Works

### Health Checks
```bash
# API health
curl https://nexus-play.com/health

# Web app loads
curl -I https://nexus-play.com

# API endpoints
curl -X GET https://nexus-play.com/api/movies \
  -H "Authorization: Bearer YOUR_TOKEN"

# Video streaming (if available)
curl -I https://nexus-play.com/stream/live/test.m3u8
```

### Test on Devices
```bash
# Update API URL in mobile app config to production
API_URL=https://nexus-play.com

# Build and deploy mobile apps
npm run build:mobile
npm run submit:android
npm run submit:ios
```

---

## 🔧 Step 10: Monitoring & Maintenance

### Monitor Logs
```bash
# Real-time API logs
pm2 logs nexus-api

# Or with Docker
docker-compose logs -f api

# View error logs
tail -f ~/nexus-play/logs/error.log
```

### Database Backups
```bash
# Manual backup
pg_dump -h localhost -U nexus_user -d nexus_production > backup_$(date +%Y%m%d).sql

# Automated backups (cron)
# Add to crontab:
# 0 2 * * * pg_dump -h localhost -U nexus_user -d nexus_production | gzip > ~/backups/db_$(date +\%Y\%m\%d).sql.gz

crontab -e
```

### Monitor Performance
```bash
# Check server resources
top
free -h
df -h

# Monitor running services
pm2 status
pm2 save
pm2 startup
```

---

## 🚨 Common Issues & Fixes

### Issue: API connection refused
```bash
# Check if API is running
pm2 status
pm2 restart nexus-api

# Check logs
pm2 logs nexus-api

# Verify Nginx is proxying correctly
sudo nginx -t
```

### Issue: Mobile app can't connect to API
```bash
# Update API URL in env
# Update firewall rules on server
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw allow 5000/tcp

# Check CORS headers
curl -H "Origin: http://localhost:3000" -I https://nexus-play.com/api/
```

### Issue: Video streaming not working
```bash
# Check NGINX RTMP is running
docker ps | grep nginx

# Test RTMP ingest
ffmpeg -f lavfi -i testsrc=s=1280x720:d=10 \
  -f lavfi -i sine=f=1000:d=10 -c:v libx264 \
  -c:a aac -f flv rtmp://localhost/live/test

# Check HLS output directory
ls -la /mnt/hls/
```

### Issue: Database connection error
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
docker ps | grep postgres

# Verify credentials
psql -h localhost -U nexus_user -d nexus_production

# Check environment variables
cat .env.production | grep DB_
```

---

## 📊 Performance Optimization Checklist

- [ ] Enable Gzip compression in Nginx
- [ ] Configure HTTP caching headers
- [ ] Set up CDN for static assets
- [ ] Enable Redis caching in API
- [ ] Optimize database queries with indexes
- [ ] Enable lazy loading for images/videos
- [ ] Minify JavaScript and CSS
- [ ] Enable HTTP/2 in Nginx
- [ ] Configure rate limiting on API
- [ ] Set up monitoring with Prometheus/Grafana

---

## 🎯 Next Steps

1. **Test everything locally** before deploying
2. **Monitor logs** closely after first deployment
3. **Set up automated backups** for database
4. **Enable SSL/TLS** for secure communication
5. **Configure monitoring** with alerts
6. **Plan for scaling** as user base grows
7. **Regular security audits** and updates

---

## 📚 Important Files to Remember

```bash
# Environment configuration
.env.production

# Database credentials
credentials in .env.production (DO NOT COMMIT)

# SSL certificates
nginx/ssl/certificate.crt
nginx/ssl/private.key

# Application logs
logs/
pm2 logs

# Database backups
~/backups/
```

---

## 🆘 Getting Help

**Check logs first:**
```bash
# API logs
pm2 logs nexus-api

# System logs
journalctl -u nginx -n 50

# Docker logs
docker-compose logs api

# Database logs
sudo tail -f /var/log/postgresql/
```

**Common debugging commands:**
```bash
# Test API connectivity
curl -v https://nexus-play.com/health

# Check DNS resolution
nslookup nexus-play.com

# Test SSL certificate
openssl s_client -connect nexus-play.com:443

# Check open ports
sudo netstat -tlnp | grep LISTEN
```

---

## 🎉 You're Ready to Launch!

Congratulations! Your NEXUS Play platform is now live. Continue monitoring, gathering user feedback, and iterating on features.

**Key metrics to track:**
- User acquisition & retention
- Video playback quality/performance
- API response times
- Server resource utilization
- Live stream viewer counts
- Error rates & exceptions

Good luck! 🚀
