# NEXUS Play - Development Prompts & Build Guidelines

## 📱 Part 1: AI Prompts for Development

### Prompt 1: Mobile App Architecture
```
Build a cross-platform video streaming app using React Native/Flutter with:
- Instagram-style reels feed with vertical video scrolling
- Live video streaming integration with HLS/DASH adaptive bitrate
- Movies catalog with grid layout and playback
- News ticker with real-time updates
- Custom video player with progress tracking
- Offline watchlist sync across devices
- Multi-profile support (up to 4 sub-profiles)

Requirements:
- JWT-based authentication
- Real-time push notifications
- 60fps smooth scrolling for reels
- Adaptive bitrate player (480p-4K)
- Video caching for offline viewing
```

### Prompt 2: Live Streaming Backend
```
Create a Node.js/FastAPI live streaming microservice that:
- Ingests RTMP/RTMPS streams from studio sources
- Transcodes video to HLS/DASH formats (multi-bitrate: 480p, 720p, 1080p, 4K)
- Manages EPG (Electronic Program Guide) scheduling
- Handles concurrent live stream viewers with WebSocket updates
- Provides real-time stream health monitoring (bitrate, latency, viewer count)
- Supports custom broadcast overlays and metadata

Stack recommendation:
- FFmpeg for transcoding
- NGINX/NGINX-RTMP for RTMP ingest
- Socket.io for real-time updates
- Redis for live session caching
```

### Prompt 3: Video Player Implementation
```
Implement a custom video player component supporting:
- HLS (HTTP Live Streaming) playback
- DASH (Dynamic Adaptive Streaming over HTTP) fallback
- Adaptive bitrate switching (automatic + manual override)
- 10-second skip forward/backward
- Subtitle/audio track selection (VTT/SRT formats)
- Closed caption rendering
- Picture-in-Picture mode
- Offline progress persistence
- Live stream telemetry (viewer count, current show info)

Libraries:
- Video.js or HLS.js for playback
- Shaka Player for DASH support
```

### Prompt 4: Reels/Vertical Scrolling Feed
```
Build Instagram-style vertical reels component with:
- Full-screen vertical video cards with auto-play on scroll
- Lazy loading for performance (load ±2 adjacent videos)
- Swipe gestures for next/previous video
- Double-tap to like (with haptic feedback)
- Comment overlay and share sheet
- Creator info header with follow button
- Infinite scroll pagination with cursor-based pagination
- FlatList/SectionList optimization for 60fps scrolling

Performance targets:
- Time to first video: < 2 seconds
- Smooth 60fps scrolling even on low-end devices
- Max memory footprint: 150MB
```

### Prompt 5: News Integration
```
Create real-time news aggregator that:
- Fetches from multiple news APIs (NewsAPI, Guardian, etc.)
- Categorizes content (Latest, Trending, Tech, Sports)
- Implements breaking news ticker with background polling
- Caches news articles with SQLite/Realm
- Provides infinite scroll article list
- Includes read-time estimation for each article
- Shows article source with link previews
- Syncs read status across devices

Update frequency: Every 5-10 minutes
```

### Prompt 6: Watchlist & Persistence
```
Build cross-device watchlist sync with:
- Local-first SQLite database
- Real-time Firebase Realtime Database sync
- Conflict resolution for updates on multiple devices
- Bookmarking with timestamps (watch history)
- Category tagging (Favorites, Later, Completed)
- Search within watchlist
- Export watchlist as JSON/CSV

Sync protocol: Incremental updates with last_modified timestamps
```

### Prompt 7: Authentication & Security
```
Implement secure authentication layer with:
- Email/password registration with email verification
- OAuth2 integration (Google, Apple, Facebook sign-in)
- JWT token rotation (short-lived access token + refresh token)
- Biometric login (Face ID, fingerprint)
- Session management across devices
- Logout from all devices option
- Device trust levels

Security:
- All tokens stored in secure enclave (iOS) / keystore (Android)
- HTTPS/TLS 1.3 for all API communications
- Rate limiting on auth endpoints (5 attempts/15 min)
```

### Prompt 8: CDN & Streaming Infrastructure
```
Configure content delivery for video streaming:
- Use Cloudflare Stream, AWS CloudFront, or Bunny CDN
- Edge caching for VOD content (cache headers: max-age=86400)
- Geographic routing for live streams (nearest CDN node)
- Adaptive bitrate selection based on device connection type
- Support for different screen sizes (mobile, tablet, TV)
- Bandwidth optimization: Detect network speed and serve appropriate quality

Hostinger integration:
- Use object storage (Backblaze B2 or AWS S3 compatible)
- Configure CORS for video delivery
- Set up CDN origin pull from your streaming server
```

---

## 🔧 Part 2: Recommended Tech Stack

### **Optimal Stack for NEXUS Play (Hostinger Deployment)**

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER                        │
├─────────────────────────────────────────────────────────┤
│ Mobile (Cross-Platform)    │  Web
│ ────────────────────────   │  ────
│ • Framework: React Native  │  • React 18.x
│   (or Flutter if you want) │  • TypeScript
│ • State: Redux/Zustand    │  • Tailwind CSS
│ • Video: Video.js/HLS.js  │  • Vite (build tool)
│ • Reels: React Native      │  • Responsive Design
│   Reanimated + Gesture     │  
│   Handler                  │  
│ • Storage: AsyncStorage    │  • LocalStorage +
│   + Realm                  │    IndexedDB
│ • Navigation: React        │  
│   Navigation 6.x           │  
│ • Testing: Detox/Jest      │  • Vitest + Testing
│                            │    Library
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   BACKEND LAYER                          │
├─────────────────────────────────────────────────────────┤
│ Runtime: Node.js 18.x + Express.js (OR FastAPI/Python) │
│                                                          │
│ Primary Services:                                       │
│ ├─ Auth Service (JWT, OAuth2)                         │
│ ├─ Content Management Service (Movies/TV metadata)     │
│ ├─ Live Streaming Microservice                         │
│ │  ├─ RTMP Ingest (NGINX-RTMP)                         │
│ │  ├─ HLS Transcoding (FFmpeg)                         │
│ │  ├─ EPG Management                                   │
│ │  └─ Stream Health Monitoring                         │
│ ├─ News Aggregator Service                             │
│ ├─ Recommendation Engine                               │
│ ├─ Search Service (Elasticsearch or MeiliSearch)       │
│ └─ File Upload Service                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  DATA LAYER                              │
├─────────────────────────────────────────────────────────┤
│ Primary Database:     PostgreSQL 14+                    │
│ Cache Layer:          Redis 7.x                         │
│ Document Storage:     MongoDB (optional, for articles)  │
│ Real-time Updates:    Firebase Realtime DB OR Socket.io│
│ File Storage:         Backblaze B2 / S3-compatible      │
│ Search Index:         Elasticsearch 8.x                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                STREAMING LAYER                           │
├─────────────────────────────────────────────────────────┤
│ RTMP Ingest:          NGINX-RTMP Module                │
│ HLS Transcoding:      FFmpeg + Handbrake               │
│ Adaptive Bitrate:     Multi-bitrate HLS manifest       │
│ CDN:                  Cloudflare Stream / Bunny CDN    │
│ Live Monitoring:      Custom dashboard with metrics    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              INFRASTRUCTURE & HOSTING                    │
├─────────────────────────────────────────────────────────┤
│ Hosting Provider:     Hostinger (Node.js enabled)       │
│ Container Runtime:    Docker + Docker Compose           │
│ API Gateway:          API Gateway / Nginx reverse proxy │
│ Monitoring:           PM2/Forever + ELK stack           │
│ CI/CD Pipeline:       GitHub Actions / GitLab CI        │
│ Environment Config:   .env files + Vault (secrets)      │
│ Logging:              Winston / Pino + LogStash         │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Part 3: Production Build Structure (dist folder)

### **Directory Layout**

```
nexus-play-production/
├── dist/
│   ├── mobile/
│   │   ├── android/
│   │   │   ├── app-release.aab              # Play Store
│   │   │   └── app-release.apk              # Direct APK
│   │   └── ios/
│   │       ├── Nexus.ipa                    # App Store
│   │       └── Nexus-release.xcarchive      # Archive
│   ├── web/
│   │   ├── index.html
│   │   ├── assets/
│   │   │   ├── js/
│   │   │   │   ├── main.[hash].js
│   │   │   │   └── vendor.[hash].js
│   │   │   ├── css/
│   │   │   │   └── main.[hash].css
│   │   │   └── images/
│   │   ├── manifest.json                    # PWA manifest
│   │   └── service-worker.js
│   ├── api/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── models/
│   │   │   └── config/
│   │   ├── package.json
│   │   └── .env.production
│   ├── nginx/
│   │   ├── nginx.conf
│   │   ├── default.conf
│   │   └── ssl/
│   │       ├── certificate.crt
│   │       └── private.key
│   ├── streaming/
│   │   ├── ffmpeg-config/
│   │   ├── hls-outputs/
│   │   └── transcoding-queue/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.streaming
│   └── .env.production

```

### **Build Commands**

```bash
# Android APK/AAB
cd mobile && npm run build:android
# Output: dist/mobile/android/app-release.apk

# iOS IPA
cd mobile && npm run build:ios
# Output: dist/mobile/ios/Nexus.ipa

# Web (React)
cd web && npm run build
# Output: dist/web/ (ready for Hostinger)

# API Server
cd api && npm run build
# Output: dist/api/ (Node.js server)

# Everything together
npm run build:all  # Triggers all builds
```

---

## 🚀 Part 4: Testing on Multiple Devices

### **Local Testing Setup**

```bash
# Android Emulator
npx react-native run-android --simulator "Pixel 5"
npx react-native run-android --simulator "Samsung Galaxy S21"

# iOS Simulator
npx react-native run-ios --simulator="iPhone 14"
npx react-native run-ios --simulator="iPad Air"

# Physical Devices
npx react-native run-android --udid=DEVICE_ID
npx react-native run-ios --udid=DEVICE_UDID
```

### **Cloud Testing Services** (for Hostinger)

```
1. BrowserStack / Appetize.io
   - Test on 1000+ real devices
   - No local setup needed
   - Cloud streaming to your browser

2. AWS Device Farm
   - Android & iOS device testing
   - Automated test runs
   - Performance metrics

3. Firebase Test Lab
   - Free tier: 10 tests/day
   - Screenshots, videos, logs
   - Integrated with CI/CD
```

### **Performance Testing**

```bash
# Network throttling (simulate Hostinger latency)
npx react-native log-android
adb shell settings put global http_proxy :0  # Disable proxy

# Memory profiling
npm install react-native-memory-checker
npx react-native-performance

# Video streaming test
# Test with HLS player in different network conditions
# (2G, 3G, 4G, 5G, WiFi)
```

---

## 🔗 Part 5: Hostinger Integration

### **Hostinger Node.js Hosting Setup**

```bash
# 1. Connect via SSH
ssh username@your-hostinger-server.com

# 2. Install Node.js (if not pre-installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone your repository
git clone <your-repo-url> /home/nexus-play
cd /home/nexus-play

# 4. Install dependencies
npm install --production

# 5. Set environment variables
cp .env.example .env.production
# Edit .env.production with your database credentials, API keys

# 6. Start with PM2 (process manager)
npm install -g pm2
pm2 start "npm run start" --name "nexus-api"
pm2 save
pm2 startup

# 7. Configure Nginx reverse proxy
sudo nano /etc/nginx/sites-available/nexus-play
# Add configuration below...

# 8. SSL Certificate (Let's Encrypt)
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d your-domain.com

# 9. Restart Nginx
sudo systemctl restart nginx
```

### **Nginx Configuration for Hostinger**

```nginx
# /etc/nginx/sites-available/nexus-play

upstream nexus_api {
    server 127.0.0.1:5000;
}

upstream nexus_streaming {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name nexus-play.com www.nexus-play.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nexus-play.com www.nexus-play.com;

    ssl_certificate /etc/letsencrypt/live/nexus-play.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nexus-play.com/privkey.pem;

    # Web frontend (static)
    location / {
        root /home/nexus-play/dist/web;
        try_files $uri /index.html;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # API endpoints
    location /api/ {
        proxy_pass http://nexus_api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Video streaming
    location /stream/ {
        proxy_pass http://nexus_streaming/;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # HLS playlist caching
    location ~ \.m3u8$ {
        proxy_pass http://nexus_streaming;
        expires 10s;
        add_header Cache-Control "public, must-revalidate";
    }

    # HLS segment caching (1 hour)
    location ~ \.ts$ {
        proxy_pass http://nexus_streaming;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## ✅ Part 6: Quality Checklist Before Deployment

- [ ] Video playback tested on 2G/3G/4G/5G networks
- [ ] All videos have HLS adaptive bitrate variants (480p, 720p, 1080p, 4K)
- [ ] Reels feed maintains 60fps on Pixel 4 & iPhone XS (low-end devices)
- [ ] Memory leak testing (no more than 5% increase per scroll cycle)
- [ ] Live stream latency < 10 seconds (HLS target)
- [ ] News ticker updates within 5 seconds of API push
- [ ] Watchlist syncs across devices in < 2 seconds
- [ ] JWT token refresh doesn't interrupt playback
- [ ] Offline mode works for cached content
- [ ] App store builds signed with correct certificates
- [ ] GDPR/Privacy compliance for user data
- [ ] Rate limiting prevents API abuse (100 req/min per user)
- [ ] CDN caching headers optimized for bandwidth
- [ ] Database backups automated daily
- [ ] Error logging integrated with Sentry/LogRocket
- [ ] Performance monitoring with New Relic/DataDog

---

## 🎯 Next Steps

1. **Week 1**: Set up project structure, configure Hostinger, initialize Git CI/CD
2. **Week 2-3**: Build authentication, basic video player, Movies catalog
3. **Week 4-5**: Implement reels feed with performance optimization
4. **Week 6**: Live streaming integration, news ticker
5. **Week 7**: Cross-device sync, watchlist, offline support
6. **Week 8**: Testing, bug fixes, performance optimization
7. **Week 9**: App store submissions (iOS TestFlight, Android beta)
8. **Week 10**: Launch!

Good luck with NEXUS Play! 🚀
