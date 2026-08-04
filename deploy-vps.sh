#!/bin/bash
# ====================================================================
# NEXUS PLAY - ONE-CLICK VPS DEPLOYMENT SCRIPT
# Runs Node.js API (Port 9001) + Expo Web Frontend + PM2 Process Manager
# ====================================================================

set -e

echo "🚀 Starting NEXUS Play VPS Deployment..."

# 1. Update system packages & install Node.js, FFmpeg, Nginx, PM2 if needed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs ffmpeg nginx
fi

if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    sudo npm install -g pm2
fi

# 2. Install API dependencies & build
echo "⚙️ Setting up API Server..."
cd api
npm install --production
cd ..

# 3. Install Mobile Web dependencies & build web export
echo "📱 Building Web Frontend..."
cd mobile
npm install
npm run build:web
cd ..

# 4. Copy Web export dist to API public static directory
echo "🚚 Deploying web assets to API server static host..."
mkdir -p api/dist
cp -r mobile/dist/* api/dist/

# 5. Start API & Static Web server with PM2 on Port 9001
echo "🔥 Starting NEXUS Play service with PM2 on Port 9001..."
cd api
pm2 start ecosystem.config.cjs || pm2 restart nexus-play-api
pm2 save
cd ..

echo "===================================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "🌐 API & Web Platform running on: http://YOUR_VPS_IP:9001"
echo "===================================================="
