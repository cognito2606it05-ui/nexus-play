# NEXUS Play - Project Structure & Organization

## 📁 Root Directory Structure

```
nexus-play/
├── web/                           # React web app
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   ├── SignupPage.tsx
│   │   │   │   ├── ProfileForm.tsx
│   │   │   │   └── __tests__/
│   │   │   ├── Dashboard/
│   │   │   │   ├── Home.tsx
│   │   │   │   ├── Hero.tsx
│   │   │   │   ├── ContinueWatching.tsx
│   │   │   │   └── Carousel.tsx
│   │   │   ├── Movies/
│   │   │   │   ├── MovieGrid.tsx
│   │   │   │   ├── MovieDetail.tsx
│   │   │   │   ├── MovieCard.tsx
│   │   │   │   └── FilterBar.tsx
│   │   │   ├── TVShows/
│   │   │   │   ├── TVShowGrid.tsx
│   │   │   │   ├── TVShowDetail.tsx
│   │   │   │   ├── SeasonSelector.tsx
│   │   │   │   └── EpisodeList.tsx
│   │   │   ├── LiveTV/
│   │   │   │   ├── LiveBroadcast.tsx
│   │   │   │   ├── EPGGuide.tsx
│   │   │   │   ├── ChannelTuner.tsx
│   │   │   │   └── LiveChat.tsx
│   │   │   ├── News/
│   │   │   │   ├── NewsFeed.tsx
│   │   │   │   ├── NewsDetail.tsx
│   │   │   │   ├── BreakingTicker.tsx
│   │   │   │   └── CategoryTabs.tsx
│   │   │   ├── Search/
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── SearchResults.tsx
│   │   │   │   ├── Filters.tsx
│   │   │   │   └── TypeAhead.tsx
│   │   │   ├── Player/
│   │   │   │   ├── VideoPlayer.tsx
│   │   │   │   ├── Controls.tsx
│   │   │   │   ├── Subtitles.tsx
│   │   │   │   ├── AudioTracks.tsx
│   │   │   │   └── QualitySelector.tsx
│   │   │   ├── Watchlist/
│   │   │   │   ├── WatchlistPage.tsx
│   │   │   │   ├── WatchlistCard.tsx
│   │   │   │   └── ExportOptions.tsx
│   │   │   ├── User/
│   │   │   │   ├── AccountSettings.tsx
│   │   │   │   ├── ProfileManagement.tsx
│   │   │   │   ├── PreferencesPanel.tsx
│   │   │   │   └── NotificationCenter.tsx
│   │   │   ├── Layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Navigation.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── MainLayout.tsx
│   │   │   ├── Common/
│   │   │   │   ├── Loading.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   ├── Pagination.tsx
│   │   │   │   └── LazyImage.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── usePlayer.ts
│   │   │   ├── useFetch.ts
│   │   │   ├── useLocalStorage.ts
│   │   │   ├── useMediaQuery.ts
│   │   │   ├── useWindowSize.ts
│   │   │   ├── useInfiniteScroll.ts
│   │   │   └── useVideoStream.ts
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── auth.ts
│   │   │   ├── movies.ts
│   │   │   ├── tvshows.ts
│   │   │   ├── livestream.ts
│   │   │   ├── news.ts
│   │   │   ├── search.ts
│   │   │   ├── watchlist.ts
│   │   │   ├── recommendations.ts
│   │   │   └── user.ts
│   │   ├── store/
│   │   │   ├── authStore.ts
│   │   │   ├── playerStore.ts
│   │   │   ├── contentStore.ts
│   │   │   ├── uiStore.ts
│   │   │   └── index.ts
│   │   ├── types/
│   │   │   ├── api.ts
│   │   │   ├── models.ts
│   │   │   ├── auth.ts
│   │   │   ├── player.ts
│   │   │   └── common.ts
│   │   ├── utils/
│   │   │   ├── constants.ts
│   │   │   ├── helpers.ts
│   │   │   ├── formatters.ts
│   │   │   ├── validators.ts
│   │   │   └── logger.ts
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   ├── tailwind.config.ts
│   │   │   ├── animations.css
│   │   │   └── responsive.css
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── logo.svg
│   │   ├── images/
│   │   └── fonts/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
│
├── mobile/                        # React Native app
│   ├── src/
│   │   ├── screens/
│   │   │   ├── Auth/
│   │   │   │   ├── LoginScreen.tsx
│   │   │   │   ├── SignupScreen.tsx
│   │   │   │   ├── SplashScreen.tsx
│   │   │   │   └── OnboardingScreen.tsx
│   │   │   ├── HomeStack/
│   │   │   │   ├── HomeScreen.tsx
│   │   │   │   ├── MovieDetailScreen.tsx
│   │   │   │   ├── PlayerScreen.tsx
│   │   │   │   └── SearchScreen.tsx
│   │   │   ├── ReelsStack/
│   │   │   │   ├── ReelsScreen.tsx
│   │   │   │   ├── ReelDetailScreen.tsx
│   │   │   │   └── CommentsScreen.tsx
│   │   │   ├── LiveStack/
│   │   │   │   ├── LiveBroadcastScreen.tsx
│   │   │   │   ├── EPGScreen.tsx
│   │   │   │   └── LiveChatScreen.tsx
│   │   │   ├── NewsStack/
│   │   │   │   ├── NewsScreen.tsx
│   │   │   │   ├── NewsDetailScreen.tsx
│   │   │   │   └── BreakingNewsScreen.tsx
│   │   │   ├── WatchlistStack/
│   │   │   │   ├── WatchlistScreen.tsx
│   │   │   │   └── WatchlistDetailScreen.tsx
│   │   │   ├── ProfileStack/
│   │   │   │   ├── ProfileScreen.tsx
│   │   │   │   ├── SettingsScreen.tsx
│   │   │   │   ├── AccountScreen.tsx
│   │   │   │   └── PreferencesScreen.tsx
│   │   ├── components/
│   │   │   ├── Reels/
│   │   │   │   ├── ReelsComponent.tsx
│   │   │   │   ├── ReelCard.tsx
│   │   │   │   ├── VideoPlayer.tsx
│   │   │   │   └── GestureHandler.tsx
│   │   │   ├── Common/
│   │   │   │   ├── Loading.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   └── TabBar.tsx
│   │   │   ├── Player/
│   │   │   │   ├── VideoControls.tsx
│   │   │   │   ├── QualitySelector.tsx
│   │   │   │   └── ProgressBar.tsx
│   │   │   └── Navigation/
│   │   │       ├── BottomTabNavigator.tsx
│   │   │       ├── DrawerNavigator.tsx
│   │   │       └── AuthNavigator.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useNavigation.ts
│   │   │   ├── usePlayer.ts
│   │   │   ├── useFetch.ts
│   │   │   ├── useReels.ts
│   │   │   └── useLiveStream.ts
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── auth.ts
│   │   │   ├── storage.ts
│   │   │   ├── reels.ts
│   │   │   ├── news.ts
│   │   │   └── notifications.ts
│   │   ├── store/
│   │   │   ├── authStore.ts
│   │   │   ├── contentStore.ts
│   │   │   ├── playerStore.ts
│   │   │   └── uiStore.ts
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   ├── models.ts
│   │   │   └── api.ts
│   │   ├── utils/
│   │   │   ├── constants.ts
│   │   │   ├── helpers.ts
│   │   │   ├── permissions.ts
│   │   │   └── logger.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── colors.ts
│   │   │   └── fonts.ts
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── app.json
│   ├── eas.json
│   ├── package.json
│   ├── tsconfig.json
│   └── babel.config.js
│
├── api/                           # Node.js/Express API
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.ts
│   │   │   ├── movieController.ts
│   │   │   ├── tvShowController.ts
│   │   │   ├── liveStreamController.ts
│   │   │   ├── newsController.ts
│   │   │   ├── searchController.ts
│   │   │   ├── userController.ts
│   │   │   ├── watchlistController.ts
│   │   │   ├── recommendationController.ts
│   │   │   └── uploadController.ts
│   │   ├── models/
│   │   │   ├── User.ts
│   │   │   ├── Movie.ts
│   │   │   ├── TVShow.ts
│   │   │   ├── Episode.ts
│   │   │   ├── LiveStream.ts
│   │   │   ├── News.ts
│   │   │   ├── Watchlist.ts
│   │   │   ├── UserProfile.ts
│   │   │   ├── Comment.ts
│   │   │   └── Rating.ts
│   │   ├── routes/
│   │   │   ├── authRoutes.ts
│   │   │   ├── movieRoutes.ts
│   │   │   ├── tvShowRoutes.ts
│   │   │   ├── liveStreamRoutes.ts
│   │   │   ├── newsRoutes.ts
│   │   │   ├── searchRoutes.ts
│   │   │   ├── userRoutes.ts
│   │   │   ├── watchlistRoutes.ts
│   │   │   └── recommendationRoutes.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── validation.ts
│   │   │   ├── rateLimiter.ts
│   │   │   ├── logging.ts
│   │   │   └── cors.ts
│   │   ├── services/
│   │   │   ├── authService.ts
│   │   │   ├── movieService.ts
│   │   │   ├── tvShowService.ts
│   │   │   ├── streamingService.ts
│   │   │   ├── transcodingService.ts
│   │   │   ├── newsService.ts
│   │   │   ├── searchService.ts
│   │   │   ├── recommendationService.ts
│   │   │   ├── emailService.ts
│   │   │   └── cdnService.ts
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   ├── migrations/
│   │   │   │   ├── 001_createUsersTable.ts
│   │   │   │   ├── 002_createMoviesTable.ts
│   │   │   │   ├── 003_createTVShowsTable.ts
│   │   │   │   └── ...
│   │   │   ├── seeds/
│   │   │   │   ├── seedUsers.ts
│   │   │   │   ├── seedMovies.ts
│   │   │   │   └── ...
│   │   │   └── migrations.ts
│   │   ├── utils/
│   │   │   ├── constants.ts
│   │   │   ├── helpers.ts
│   │   │   ├── validators.ts
│   │   │   ├── jwt.ts
│   │   │   ├── password.ts
│   │   │   └── errors.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── database.ts
│   │   │   ├── redis.ts
│   │   │   └── aws.ts
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   ├── models.ts
│   │   │   ├── api.ts
│   │   │   └── auth.ts
│   │   └── index.ts
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
├── streaming/                     # FFmpeg + NGINX-RTMP service
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── streamController.ts
│   │   │   ├── transcodingController.ts
│   │   │   └── hlsController.ts
│   │   ├── services/
│   │   │   ├── ffmpegService.ts
│   │   │   ├── hlsService.ts
│   │   │   ├── dashService.ts
│   │   │   ├── streamHealthMonitor.ts
│   │   │   └── recordingService.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── ffmpeg.ts
│   │   │   └── nginx.conf
│   │   └── index.ts
│   ├── scripts/
│   │   ├── start-streaming.sh
│   │   ├── transcode.sh
│   │   └── health-check.sh
│   ├── package.json
│   └── docker-compose.yml
│
├── nginx/                         # Nginx reverse proxy config
│   ├── default.conf
│   ├── rtmp.conf
│   ├── ssl/
│   │   ├── certificate.crt
│   │   └── private.key
│   └── nginx.conf
│
├── scripts/
│   ├── build.sh
│   ├── deploy.sh
│   ├── deploy-mobile.sh
│   ├── setup-hostinger.sh
│   ├── health-check.sh
│   └── backup.sh
│
├── monitoring/
│   ├── prometheus.yml
│   ├── grafana-dashboards/
│   ├── loki-config.yml
│   └── alerting-rules.yml
│
├── sql/
│   ├── init.sql
│   ├── schema.sql
│   ├── indexes.sql
│   └── procedures.sql
│
├── docker-compose.yml
├── docker-compose.monitoring.yml
├── .env.example
├── .env.production
├── .gitignore
├── .dockerignore
├── README.md
├── package.json
├── tsconfig.json
└── ARCHITECTURE.md
```

---

## 📋 Workspace Configuration

### Root `package.json` Scripts

```json
{
  "scripts": {
    "install:all": "npm install && npm install --workspace=web && npm install --workspace=mobile && npm install --workspace=api && npm install --workspace=streaming",
    "build:all": "npm run build --workspace=web && npm run build --workspace=mobile && npm run build --workspace=api",
    "dev": "concurrently \"npm run dev --workspace=web\" \"npm run dev --workspace=api\"",
    "test": "npm test --workspace=web && npm test --workspace=api && npm test --workspace=mobile"
  },
  "workspaces": [
    "web",
    "mobile",
    "api",
    "streaming"
  ]
}
```

---

## 📦 Build Output Structure (dist/)

```
dist/
├── web/
│   ├── index.html
│   ├── assets/
│   │   ├── js/
│   │   │   ├── main.[hash].js
│   │   │   ├── vendor.[hash].js
│   │   │   └── components.[hash].js
│   │   ├── css/
│   │   │   └── main.[hash].css
│   │   └── images/
│   ├── favicon.ico
│   └── manifest.json
├── mobile/
│   ├── android/
│   │   ├── app-release.aab             # Play Store
│   │   ├── app-release.apk             # Direct APK
│   │   └── build-logs/
│   └── ios/
│       ├── Nexus.ipa
│       ├── Nexus.xcarchive
│       └── build-logs/
├── api/
│   ├── src/
│   ├── dist/
│   │   ├── index.js
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   └── middleware/
│   ├── node_modules/
│   └── package.json
└── streaming/
    ├── hls/
    │   └── [stream-outputs]
    ├── dash/
    │   └── [dash-outputs]
    └── recordings/
        └── [archived-broadcasts]
```

---

## 🔄 Monorepo Workflow

### Install All Dependencies
```bash
npm install
npm run install:all
```

### Development
```bash
# Run all dev servers
npm run dev

# Run individual workspace
npm run dev --workspace=web
npm run dev --workspace=api
```

### Build
```bash
# Build all
npm run build:all

# Build specific
npm run build --workspace=web
npm run build --workspace=mobile
npm run build --workspace=api
```

### Testing
```bash
# Run all tests
npm test

# Run specific
npm test --workspace=web
npm test --workspace=api
```

---

## 🚀 Deployment Steps

1. **Build Phase**: All workspaces are built to their respective `dist/` folders
2. **Web**: `dist/web/` → Deployed to Hostinger nginx server
3. **API**: `dist/api/` → Containerized and deployed via Docker
4. **Mobile**: 
   - Android: `dist/mobile/android/app-release.aab` → Google Play Store
   - iOS: `dist/mobile/ios/Nexus.ipa` → Apple App Store
5. **Streaming**: Containerized service running alongside API

---

## 📊 Key Folder Purposes

| Folder | Purpose |
|--------|---------|
| `web/` | React web application |
| `mobile/` | React Native cross-platform app |
| `api/` | Express.js backend services |
| `streaming/` | FFmpeg + HLS transcoding |
| `nginx/` | Reverse proxy & SSL config |
| `scripts/` | Automation & deployment scripts |
| `monitoring/` | Prometheus, Grafana, Loki configs |
| `sql/` | Database migrations & seeds |

---

## ⚡ Development Tips

1. **Use monorepo commands** from root for consistency
2. **Shared types** can be in a common folder or imported from workspace tsconfig paths
3. **Environment variables** configured per-workspace in .env files
4. **Git hooks** with husky for pre-commit linting
5. **CI/CD** in `.github/workflows/` for automated builds

---

Good luck building NEXUS Play! 🚀
