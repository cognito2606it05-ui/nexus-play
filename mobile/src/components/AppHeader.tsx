import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Platform, Animated, useWindowDimensions, TextInput, Switch, ScrollView } from 'react-native';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import { useLanguage, Translate } from '../state/LanguageContext';
import { api } from '../api/client';
import { HoverPressable } from './HoverPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIMARY_LOGO = require('../../assets/nexuslogo.png');

interface AppHeaderProps {
  onPressAvatar?: () => void;
  scrollY?: Animated.Value;
  onSearch?: (text: string) => void;
  onRefresh?: () => void;
  onCreatePost?: () => void;
  onOpenAssistant?: () => void;
}

export function AppHeader({ onPressAvatar, scrollY, onSearch, onRefresh, onCreatePost, onOpenAssistant }: AppHeaderProps) {
  const { activeProfile, user, signOut } = useAuth();
  const { colors, toggleTheme, isDark } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();

  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const isTablet = Platform.OS === 'web' && width >= 768 && width < 1024;
  const isMobile = !isDesktop && !isTablet;

  const currentRouteName = useNavigationState((state) => {
    if (!state) return 'Home';
    let route: any = state.routes[state.index ?? 0];
    while (route && route.state) {
      const idx = route.state.index ?? 0;
      route = route.state.routes[idx];
    }
    return route ? route.name : 'Home';
  });

  // Local state
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showAppsDropdown, setShowAppsDropdown] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const [dateTime, setDateTime] = useState('');
  
  // Weather Geolocation State
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lon: number }>({ lat: 28.6139, lon: 77.2090 });
  const [locationName, setLocationName] = useState('Delhi');
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);
  const [weatherInfo, setWeatherInfo] = useState({
    temp: 36,
    condition: 'Sunny',
    feelsLike: 38,
    humidity: 45,
    windSpeed: 12,
    pressure: 1008,
    sunrise: '05:30 AM',
    sunset: '07:12 PM',
    icon: 'https://unpkg.com/lucide-static@latest/icons/sun.svg',
    hourly: [] as any[],
    daily: [] as any[],
  });

  // Search Features State
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [voiceActive, setVoiceActive] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // Mobile Menu Overlay
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const TRENDING_SEARCHES = ['AI breakthroughs', 'Delhi weather today', 'Stock market analysis', 'NEXUS news live'];

  // Stats calculation
  const [stats, setStats] = useState({
    followers: 1240,
    following: 0,
    posts: 0,
    liveSessions: 0,
    savedPosts: 0,
    savedReels: 0,
  });

  // Animations
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const livePulse = useRef(new Animated.Value(1)).current;

  // Initial weather cache load on mount
  useEffect(() => {
    AsyncStorage.getItem('NEXUS_WEATHER_CACHE')
      .then((val) => {
        if (val) {
          const cache = JSON.parse(val);
          if (cache.locationName) setLocationName(cache.locationName);
          if (cache.geoCoords) setGeoCoords(cache.geoCoords);
          if (cache.weatherInfo) setWeatherInfo(cache.weatherInfo);
        }
      })
      .catch(() => {});
  }, []);

  // Save weather info changes to cache
  useEffect(() => {
    if (locationName !== 'Delhi' || weatherInfo.temp !== 36) {
      AsyncStorage.setItem('NEXUS_WEATHER_CACHE', JSON.stringify({
        locationName,
        geoCoords,
        weatherInfo
      })).catch(() => {});
    }
  }, [locationName, geoCoords, weatherInfo]);

  // Browser Geolocation Hook
  useEffect(() => {
    if (Platform.OS === 'web' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setGeoCoords({ lat, lon });
          
          // Reverse geocoding city name via OpenStreetMap Nominatim
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
            headers: { 'User-Agent': 'NexusPlay/1.0' }
          })
            .then(res => res.json())
            .then(data => {
              if (data && data.address) {
                const city = data.address.city || data.address.town || data.address.village || data.address.state_district || 'Delhi';
                setLocationName(city);
              }
            })
            .catch(() => {});
        },
        () => {
          // Denied or error
        }
      );
    }
  }, []);

  // Fetch Weather Details (Open-Meteo API)
  const fetchWeather = () => {
    const { lat, lon } = geoCoords;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,pressure_msl,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`)
      .then(res => res.json())
      .then(data => {
        if (data && data.current) {
          const current = data.current;
          const hourly = data.hourly;
          const daily = data.daily;

          const temp = Math.round(current.temperature_2m);
          const weatherCode = current.weather_code;

          let condition = 'Sunny';
          let icon = 'https://unpkg.com/lucide-static@latest/icons/sun.svg';
          
          if (weatherCode >= 1 && weatherCode <= 3) {
            condition = 'Partly Cloudy';
            icon = 'https://unpkg.com/lucide-static@latest/icons/cloud-sun.svg';
          } else if (weatherCode >= 45 && weatherCode <= 48) {
            condition = 'Foggy';
            icon = 'https://unpkg.com/lucide-static@latest/icons/cloud-fog.svg';
          } else if (weatherCode >= 51 && weatherCode <= 57) {
            condition = 'Drizzle';
            icon = 'https://unpkg.com/lucide-static@latest/icons/cloud-drizzle.svg';
          } else if (weatherCode >= 61 && weatherCode <= 67) {
            condition = 'Rainy';
            icon = 'https://unpkg.com/lucide-static@latest/icons/cloud-rain.svg';
          } else if (weatherCode >= 71 && weatherCode <= 86) {
            condition = 'Snowy';
            icon = 'https://unpkg.com/lucide-static@latest/icons/cloud-snow.svg';
          } else if (weatherCode >= 95) {
            condition = 'Thunderstorm';
            icon = 'https://unpkg.com/lucide-static@latest/icons/cloud-lightning.svg';
          }

          // Parse 6 hours hourly
          const currentHour = new Date().getHours();
          const parsedHourly = [];
          for (let i = 0; i < 6; i++) {
            const index = (currentHour + i) % 24;
            const hourCode = hourly.weather_code[index] || 0;
            let hourIcon = '☀️';
            if (hourCode >= 1 && hourCode <= 3) hourIcon = '🌤️';
            else if (hourCode >= 45 && hourCode <= 48) hourIcon = '🌫️';
            else if (hourCode >= 51 && hourCode <= 67) hourIcon = '🌧️';
            else if (hourCode >= 95) hourIcon = '⛈️';

            parsedHourly.push({
              time: `${index === 0 ? 12 : index > 12 ? index - 12 : index} ${index >= 12 ? 'PM' : 'AM'}`,
              temp: Math.round(hourly.temperature_2m[index]),
              icon: hourIcon
            });
          }

          // Parse 7 days daily
          const parsedDaily = [];
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const todayIndex = new Date().getDay();
          for (let i = 0; i < 7; i++) {
            const dayName = days[(todayIndex + i) % 7];
            const dayCode = daily.weather_code[i] || 0;
            let dayIcon = '☀️';
            if (dayCode >= 1 && dayCode <= 3) dayIcon = '🌤️';
            else if (dayCode >= 45 && dayCode <= 48) dayIcon = '🌫️';
            else if (dayCode >= 51 && dayCode <= 67) dayIcon = '🌧️';
            else if (dayCode >= 95) dayIcon = '⛈️';

            parsedDaily.push({
              day: dayName,
              max: Math.round(daily.temperature_2m_max[i]),
              min: Math.round(daily.temperature_2m_min[i]),
              icon: dayIcon
            });
          }

          setWeatherInfo({
            temp,
            condition,
            feelsLike: Math.round(current.apparent_temperature),
            humidity: current.relative_humidity_2m,
            windSpeed: Math.round(current.wind_speed_10m),
            pressure: Math.round(current.pressure_msl),
            sunrise: daily.sunrise[0] ? new Date(daily.sunrise[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '05:30 AM',
            sunset: daily.sunset[0] ? new Date(daily.sunset[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '07:12 PM',
            icon,
            hourly: parsedHourly,
            daily: parsedDaily,
          });
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 60000);
    return () => clearInterval(interval);
  }, [geoCoords]);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setDateTime(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  // Search Dropdown & History Persistence
  useEffect(() => {
    AsyncStorage.getItem('NEXUS_RECENT_SEARCHES')
      .then((val) => {
        if (val) setRecentSearches(JSON.parse(val));
      })
      .catch(() => {});
  }, []);

  const saveSearchQuery = (query: string) => {
    if (!query.trim()) return;
    const updated = [query, ...recentSearches.filter(q => q !== query)].slice(0, 5);
    setRecentSearches(updated);
    AsyncStorage.setItem('NEXUS_RECENT_SEARCHES', JSON.stringify(updated)).catch(() => {});
  };

  const handleSearchChange = (text: string) => {
    setSearchVal(text);
    onSearch?.(text);
  };

  const handleSearchSubmit = () => {
    saveSearchQuery(searchVal);
    setSearchFocused(false);
    onSearch?.(searchVal);
    if (currentRouteName !== 'News' && currentRouteName !== 'Home') {
      navigation.navigate('News', { searchQuery: searchVal });
    }
  };

  const selectSearchItem = (query: string) => {
    setSearchVal(query);
    onSearch?.(query);
    saveSearchQuery(query);
    setSearchFocused(false);
    if (currentRouteName !== 'News' && currentRouteName !== 'Home') {
      navigation.navigate('News', { searchQuery: query });
    }
  };

  const clearRecentSearch = (query: string) => {
    const updated = recentSearches.filter(q => q !== query);
    setRecentSearches(updated);
    AsyncStorage.setItem('NEXUS_RECENT_SEARCHES', JSON.stringify(updated)).catch(() => {});
  };

  // Keyboard shortcut Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  // Voice Speech API Search
  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.onstart = () => setVoiceActive(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSearchVal(transcript);
        onSearch?.(transcript);
        saveSearchQuery(transcript);
      };
      recognition.onerror = () => setVoiceActive(false);
      recognition.onend = () => setVoiceActive(false);
      recognition.start();
    } else {
      alert('Voice Speech search is only supported in desktop browsers (Chrome/Edge/Safari).');
    }
  };

  // Pulse & scale loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1.15, duration: 800, useNativeDriver: false }),
        Animated.timing(livePulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1.2, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.5, duration: 1500, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  // stats load
  const loadStats = async () => {
    if (!activeProfile) return;
    try {
      const activity = await api.getProfileActivity(activeProfile.id).catch(() => null);
      const postsRes = await api.getPosts().catch(() => null);
      const reelsRes = await api.getReels(null, 50, activeProfile.name).catch(() => null);
      const streamsRes = await api.getStreams().catch(() => null);

      const followingCount = activity?.follows?.length || 0;
      const postsCount = postsRes?.data?.filter((p: any) => p.profile?.id === activeProfile.id)?.length || 0;
      const reelsCount = reelsRes?.data?.length || 0;
      const liveSessionsCount = streamsRes?.data?.filter((s: any) => s.profile_id === activeProfile.id)?.length || 0;

      let savedPostsCount = 0;
      let savedReelsCount = 0;
      if (activity?.watchlist) {
        activity.watchlist.forEach((w: any) => {
          if (w.contentType === 'post') savedPostsCount++;
          else if (w.contentType === 'reel') savedReelsCount++;
        });
      }

      setStats({
        followers: activeProfile.subscribed ? 2450 : 124,
        following: followingCount,
        posts: postsCount + reelsCount,
        liveSessions: liveSessionsCount,
        savedPosts: savedPostsCount,
        savedReels: savedReelsCount,
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (showDropdown) {
      loadStats();
      Animated.timing(dropdownAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(dropdownAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [showDropdown]);

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
    onPressAvatar?.();
  };

  const handleDropdownNavigate = (tabName: string, params?: any) => {
    setShowDropdown(false);
    navigation.navigate(tabName, params);
  };

  const headerBg = scrollY
    ? scrollY.interpolate({
        inputRange: [0, 80],
        outputRange: [
          isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
          isDark ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)'
        ],
        extrapolate: 'clamp',
      })
    : (isDark ? '#0f172a' : '#ffffff');

  return (
    <>
      {/* Click-Outside Backdrops */}
      {(showDropdown || showLangDropdown || showAppsDropdown || showWeatherPopup || searchFocused) && (
        <Pressable
          style={styles.dropdownBackdrop}
          onPress={() => {
            setShowDropdown(false);
            setShowLangDropdown(false);
            setShowAppsDropdown(false);
            setShowWeatherPopup(false);
            setSearchFocused(false);
          }}
        />
      )}

      {/* STICKY MAIN HEADER CONTAINER */}
      <Animated.View
        style={[
          styles.floatingHeader,
          {
            backgroundColor: headerBg as any,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB',
            borderBottomWidth: 1,
            zIndex: 9999,
          }
        ]}
      >
        <View style={styles.headerContentWrapper}>
          {/* LEFT SECTION: Logo & Weather */}
          <View style={styles.headerSectionLeft}>
            {/* 1. LOGO */}
            <Pressable onPress={() => navigation.navigate('Home')} style={styles.logoContainer}>
              <Image source={PRIMARY_LOGO} style={styles.logoImage} resizeMode="contain" />
            </Pressable>

            {/* 2. WEATHER WIDGET (Desktop/Tablet only) */}
            {(isDesktop || isTablet) && (
              <Pressable onPress={() => setShowWeatherPopup(!showWeatherPopup)} style={styles.weatherWidget}>
                <Image source={{ uri: weatherInfo.icon }} style={[styles.weatherIcon, { tintColor: isDark ? '#94A3B8' : '#475569' }]} />
                <Text style={[styles.weatherText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  {locationName} • {weatherInfo.temp}°C
                </Text>
              </Pressable>
            )}
          </View>

          {/* CENTER SECTION: Navigation Menu (Desktop & Tablet) */}
          <View style={styles.headerSectionCenter}>
            {(isDesktop || isTablet) && (
              <View style={styles.navMenuContainer}>
                {([
                  { name: 'Home', label: 'HOME' },
                  { name: 'Reels', label: 'REELS' },
                  { name: 'News', label: 'NEWS' }
                ] as const).map((tab) => {
                  const isFocused = currentRouteName === tab.name;
                  const activeColor = isFocused ? colors.primary : (isDark ? '#94A3B8' : '#475569');
                  return (
                    <HoverPressable
                      key={tab.name}
                      style={styles.navTabButton}
                      onPress={() => navigation.navigate(tab.name)}
                    >
                      <Text style={[styles.navTabText, { color: activeColor }]}>
                        {t(tab.label)}
                      </Text>
                      {isFocused && (
                        <View style={[styles.navTabActiveLine, { backgroundColor: colors.primary }]} />
                      )}
                    </HoverPressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* RIGHT SECTION: Search Bar & Action Buttons & Profile */}
          <View style={styles.headerSectionRight}>
            {/* 4. SEARCH BAR (Desktop/Tablet) */}
            {(isDesktop || isTablet) && (
              <View style={styles.searchWrapper}>
                <View style={[
                  styles.searchContainer,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    borderColor: searchFocused ? colors.primary : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                  }
                ]}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    ref={searchInputRef}
                    style={[styles.searchInput, { color: isDark ? '#F8FAFC' : '#0F172A', minWidth: 0 }]}
                    placeholder={t("Search News, Videos...")}
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={searchVal}
                    onFocus={() => setSearchFocused(true)}
                    onChangeText={handleSearchChange}
                    onSubmitEditing={handleSearchSubmit}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  
                  {/* Voice Search Trigger */}
                  <Pressable onPress={startVoiceSearch} style={styles.voiceSearchBtn}>
                    <Image 
                      source={{ uri: 'https://unpkg.com/lucide-static@latest/icons/mic.svg' }} 
                      style={[styles.micIcon, { tintColor: voiceActive ? '#EF4444' : (isDark ? '#64748B' : '#94A3B8') }]} 
                    />
                  </Pressable>
                </View>

                {/* Advanced Search Popup Dropdown */}
                {searchFocused && (
                  <View style={[styles.searchDropdownCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
                    {recentSearches.length > 0 && (
                      <View style={styles.dropdownSection}>
                        <Text style={styles.dropdownSectionTitle}>Recent Searches</Text>
                        {recentSearches.map((query, index) => (
                          <View key={index} style={styles.dropdownRow}>
                            <Pressable onPress={() => selectSearchItem(query)} style={{ flex: 1 }}>
                              <Text style={[styles.dropdownItemText, { color: isDark ? '#E2E8F0' : '#334155' }]}>🕒  {query}</Text>
                            </Pressable>
                            <Pressable onPress={() => clearRecentSearch(query)} style={styles.clearRecentBtn}>
                              <Text style={{ color: '#94A3B8', fontSize: 11 }}>✕</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={styles.dropdownSection}>
                      <Text style={styles.dropdownSectionTitle}>Trending Searches</Text>
                      {TRENDING_SEARCHES.map((query, index) => (
                        <Pressable key={index} onPress={() => selectSearchItem(query)} style={styles.dropdownRow}>
                          <Text style={[styles.dropdownItemText, { color: isDark ? '#E2E8F0' : '#334155' }]}>📈  {query}</Text>
                        </Pressable>
                      ))}
                    </View>
                    
                    {/* AI Search Assistant Action */}
                    <Pressable 
                      onPress={() => { setSearchFocused(false); onOpenAssistant?.(); }}
                      style={[styles.aiSearchBanner, { backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.05)' }]}
                    >
                      <Image source={{ uri: 'https://unpkg.com/lucide-static@latest/icons/sparkles.svg' }} style={[styles.sparkleIcon, { tintColor: colors.primary }]} />
                      <Text style={[styles.aiSearchText, { color: colors.primary }]}>Ask Nexus AI Assistant</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* Pulsing Live indicator button */}
            <Animated.View style={{ transform: [{ scale: livePulse }] }}>
              <Pressable 
                onPress={() => navigation.navigate('Live')}
                style={[styles.liveButtonRed, { shadowColor: '#EF4444' }]}
              >
                <Text style={styles.liveButtonText}>🔴 LIVE</Text>
              </Pressable>
            </Animated.View>

            {/* Admin Portal Direct Trigger */}
            <Pressable 
              onPress={() => navigation.navigate('SuperAdminDashboard')}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#3B82F6', flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>👑 Admin</Text>
            </Pressable>

            {/* Language Translator */}
            <HoverPressable 
              style={[styles.iconCircleBtn, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}
              onPress={() => setShowLangDropdown(!showLangDropdown)}
            >
              <Image source={{ uri: 'https://unpkg.com/lucide-static@latest/icons/languages.svg' }} style={[styles.circleIconGlyph, { tintColor: isDark ? '#E2E8F0' : '#475569' }]} />
            </HoverPressable>

            {/* Notifications */}
            <HoverPressable 
              style={[styles.iconCircleBtn, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}
              onPress={() => alert(t('All systems operational! No new notifications.'))}
            >
              <Image source={{ uri: 'https://unpkg.com/lucide-static@latest/icons/bell.svg' }} style={[styles.circleIconGlyph, { tintColor: isDark ? '#E2E8F0' : '#475569' }]} />
              <View style={styles.badgeIndicatorDot} />
            </HoverPressable>

            {/* Theme Toggle */}
            <HoverPressable 
              style={[styles.iconCircleBtn, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}
              onPress={toggleTheme}
            >
              <Image 
                source={{ uri: isDark ? 'https://unpkg.com/lucide-static@latest/icons/sun.svg' : 'https://unpkg.com/lucide-static@latest/icons/moon.svg' }} 
                style={[styles.circleIconGlyph, { tintColor: isDark ? '#E2E8F0' : '#475569' }]} 
              />
            </HoverPressable>

            {/* Apps Menu Dropdown */}
            <HoverPressable 
              style={[styles.iconCircleBtn, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}
              onPress={() => setShowAppsDropdown(!showAppsDropdown)}
            >
              <Image source={{ uri: 'https://unpkg.com/lucide-static@latest/icons/layout-grid.svg' }} style={[styles.circleIconGlyph, { tintColor: isDark ? '#E2E8F0' : '#475569' }]} />
            </HoverPressable>

            {/* Vertical Divider */}
            <View style={[styles.verticalDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', height: 24 }]} />

            {/* 7. PROFILE AVATAR WITH ONLINE STATUS */}
            <Pressable onPress={toggleDropdown} style={styles.profileAvatarTrigger}>
              <View style={styles.profileAvatarWrapper}>
                <View style={[styles.profileAvatarFrame, activeProfile?.subscribed && styles.premiumAvatarFrame]}>
                  <Image source={{ uri: activeProfile?.avatarUrl || 'https://api.dicebear.com/7.x/bottts/png' }} style={styles.avatarImage} />
                </View>
                {/* Online status indicator */}
                <View style={styles.onlineStatusIndicator} />
              </View>
              <Text style={[styles.dropdownArrow, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                {showDropdown ? '▲' : '▼'}
              </Text>
            </Pressable>

            {/* Mobile Hamburger menu */}
            {isMobile && (
              <Pressable onPress={() => setShowMobileMenu(true)} style={styles.hamburgerBtn}>
                <Text style={{ fontSize: 24, color: isDark ? '#fff' : '#000' }}>☰</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* WEATHER POPUP FORECAST DETAILS */}
        {showWeatherPopup && (
          <View style={[styles.weatherDetailsCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <View style={styles.weatherDetailsHeader}>
              <Text style={[styles.weatherTitleText, { color: isDark ? '#fff' : '#000' }]}>{locationName} Forecast</Text>
              <Pressable onPress={() => setShowWeatherPopup(false)}>
                <Text style={{ color: '#94A3B8', fontSize: 16 }}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.weatherStatsGrid}>
              <View style={styles.weatherStatCol}>
                <Text style={styles.weatherStatLabel}><Translate text="Feels Like" /></Text>
                <Text style={[styles.weatherStatVal, { color: isDark ? '#fff' : '#000' }]}>{weatherInfo.feelsLike}°C</Text>
              </View>
              <View style={styles.weatherStatCol}>
                <Text style={styles.weatherStatLabel}><Translate text="Humidity" /></Text>
                <Text style={[styles.weatherStatVal, { color: isDark ? '#fff' : '#000' }]}>{weatherInfo.humidity}%</Text>
              </View>
              <View style={styles.weatherStatCol}>
                <Text style={styles.weatherStatLabel}><Translate text="Wind Speed" /></Text>
                <Text style={[styles.weatherStatVal, { color: isDark ? '#fff' : '#000' }]}>{weatherInfo.windSpeed} km/h</Text>
              </View>
              <View style={styles.weatherStatCol}>
                <Text style={styles.weatherStatLabel}><Translate text="Pressure" /></Text>
                <Text style={[styles.weatherStatVal, { color: isDark ? '#fff' : '#000' }]}>{weatherInfo.pressure} hPa</Text>
              </View>
            </View>

            <View style={[styles.weatherDivider, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />

            <View style={styles.weatherSunRow}>
              <Text style={[styles.weatherSunLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>🌅 <Translate text="Sunrise" />: {weatherInfo.sunrise}</Text>
              <Text style={[styles.weatherSunLabel, { color: isDark ? '#94A3B8' : '#475569' }]}>🌇 <Translate text="Sunset" />: {weatherInfo.sunset}</Text>
            </View>

            <View style={[styles.weatherDivider, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />

            {/* Hourly Forecast */}
            <Text style={[styles.weatherSectionTitle, { color: isDark ? '#94A3B8' : '#475569' }]}>
              <Translate text="Hourly Forecast" />
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weatherHourlyContainer}>
              {weatherInfo.hourly.map((h, i) => (
                <View key={i} style={styles.weatherHourlyItem}>
                  <Text style={[styles.weatherHourText, { color: isDark ? '#94A3B8' : '#475569' }]}>{h.time}</Text>
                  <Text style={styles.weatherHourIcon}>{h.icon}</Text>
                  <Text style={[styles.weatherHourTemp, { color: isDark ? '#fff' : '#000' }]}>{h.temp}°C</Text>
                </View>
              ))}
            </ScrollView>

            <View style={[styles.weatherDivider, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />

            {/* 7-Day Forecast */}
            <Text style={[styles.weatherSectionTitle, { color: isDark ? '#94A3B8' : '#475569' }]}>
              <Translate text="7-Day Forecast" />
            </Text>
            <View style={styles.weatherDailyContainer}>
              {weatherInfo.daily.map((d, i) => (
                <View key={i} style={styles.weatherDailyRow}>
                  <Text style={[styles.weatherDailyDay, { color: isDark ? '#E2E8F0' : '#334155' }]}><Translate text={d.day} /></Text>
                  <Text style={styles.weatherDailyIcon}>{d.icon}</Text>
                  <Text style={[styles.weatherDailyTemp, { color: isDark ? '#94A3B8' : '#475569' }]}>{d.max}°C / {d.min}°C</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* APPS DROPDOWN MENU */}
        {showAppsDropdown && (
          <View style={[styles.appsDropdownCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <Text style={[styles.appsTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>NEXUS APPS</Text>
            <View style={styles.appsGrid}>
              {[
                { name: 'NEXUS News', icon: '📰' },
                { name: 'NEXUS Cinema', icon: '🎬' },
                { name: 'NEXUS Music', icon: '🎵' },
                { name: 'NEXUS Sports', icon: '⚽' },
              ].map((app, index) => (
                <HoverPressable key={index} style={styles.appGridItem} onPress={() => alert(`${app.name} is coming soon!`)}>
                  <Text style={styles.appIcon}>{app.icon}</Text>
                  <Text style={[styles.appName, { color: isDark ? '#fff' : '#334155' }]}>{app.name}</Text>
                </HoverPressable>
              ))}
            </View>
          </View>
        )}

        {/* LANGUAGE TRANSLATOR DROPDOWN */}
        {showLangDropdown && (
          <View style={[styles.langDropdownCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <Text style={[styles.langDropdownTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>{t("Select Language")}</Text>
            <View style={[styles.dropdownDivider, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />
            
            {[
              { code: 'en', label: 'English' },
              { code: 'te', label: 'తెలుగు (Telugu)' },
              { code: 'hi', label: 'हिंदी (Hindi)' }
            ].map((lang) => (
              <Pressable
                key={lang.code}
                style={[styles.langDropdownRow, language === lang.code && styles.langDropdownRowActive]}
                onPress={() => {
                  setLanguage(lang.code as any);
                  setShowLangDropdown(false);
                }}
              >
                <Text style={[styles.langOptionText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{lang.label}</Text>
                {language === lang.code && <Text style={{ color: colors.primary, fontWeight: 'bold' }}>✓</Text>}
              </Pressable>
            ))}
          </View>
        )}

        {/* USER PROFILE DROPDOWN MENU */}
        {showDropdown && (
          <Animated.View
            style={[
              styles.dropdownCard,
              {
                backgroundColor: isDark ? '#1e293b' : '#ffffff',
                borderColor: isDark ? '#334155' : '#e2e8f0',
                opacity: dropdownAnim,
                transform: [
                  { scale: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
                  { translateY: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
                ]
              }
            ]}
          >
            <View style={styles.dropdownHeader}>
              <View style={styles.dropdownLargeAvatarContainer}>
                <Image source={{ uri: activeProfile?.avatarUrl || 'https://api.dicebear.com/7.x/bottts/png' }} style={styles.dropdownLargeAvatar} />
                {activeProfile?.subscribed && <View style={styles.dropdownCrown}><Text style={{ fontSize: 12 }}>👑</Text></View>}
              </View>
              <View style={styles.dropdownUserDetails}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[styles.dropdownFullName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{activeProfile?.name}</Text>
                  {activeProfile?.subscribed && <View style={styles.dropdownVerifiedTick}><Text style={{ color: '#fff', fontSize: 8 }}>✓</Text></View>}
                </View>
                <Text style={[styles.dropdownUsername, { color: isDark ? '#94A3B8' : '#64748B' }]}>@{activeProfile?.name?.toLowerCase().replace(/\s+/g, '')}</Text>
              </View>
            </View>

            {/* Profile Statistics Grid */}
            <View style={[styles.dropdownStatsGrid, { borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <View style={styles.dropdownStatItem}>
                <Text style={[styles.dropdownStatVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{stats.followers}</Text>
                <Text style={styles.dropdownStatLabel}>{t("Followers")}</Text>
              </View>
              <View style={styles.dropdownStatItem}>
                <Text style={[styles.dropdownStatVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{stats.following}</Text>
                <Text style={styles.dropdownStatLabel}>{t("Following")}</Text>
              </View>
              <View style={styles.dropdownStatItem}>
                <Text style={[styles.dropdownStatVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{stats.posts}</Text>
                <Text style={styles.dropdownStatLabel}>{t("Posts")}</Text>
              </View>
            </View>

            {/* Options List */}
            <View style={styles.dropdownOptions}>
              <Pressable style={styles.dropdownOptionRow} onPress={() => handleDropdownNavigate('Profile')}>
                <Text style={styles.dropdownOptionIcon}>👤</Text>
                <Text style={[styles.dropdownOptionText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{t("View Profile")}</Text>
              </Pressable>

              <Pressable style={styles.dropdownOptionRow} onPress={() => handleDropdownNavigate('Profile', { initialTab: 'saved' })}>
                <Text style={styles.dropdownOptionIcon}>🔖</Text>
                <Text style={[styles.dropdownOptionText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{t("Saved News")}</Text>
              </Pressable>

              <Pressable style={styles.dropdownOptionRow} onPress={() => alert(t('Added to Watch Later.'))}>
                <Text style={styles.dropdownOptionIcon}>🕒</Text>
                <Text style={[styles.dropdownOptionText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{t("Watch Later")}</Text>
              </Pressable>

              <Pressable style={styles.dropdownOptionRow} onPress={() => alert(t('Viewing history.'))}>
                <Text style={styles.dropdownOptionIcon}>📜</Text>
                <Text style={[styles.dropdownOptionText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{t("History")}</Text>
              </Pressable>

              <Pressable style={styles.dropdownOptionRow} onPress={() => handleDropdownNavigate('Profile', { editMode: true })}>
                <Text style={styles.dropdownOptionIcon}>⚙️</Text>
                <Text style={[styles.dropdownOptionText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{t("Settings")}</Text>
              </Pressable>

              <Pressable style={styles.dropdownOptionRow} onPress={signOut}>
                <Text style={styles.dropdownOptionIcon}>🚪</Text>
                <Text style={[styles.dropdownOptionText, { color: '#EF4444' }]}>{t("Logout")}</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* MOBILE MENU OVERLAY hamburger */}
        {showMobileMenu && (
          <View style={[styles.mobileMenuOverlay, { backgroundColor: isDark ? 'rgba(15,23,42,0.98)' : 'rgba(255,255,255,0.98)' }]}>
            <View style={styles.mobileMenuHeader}>
              <Image source={PRIMARY_LOGO} style={styles.logoImage} resizeMode="contain" />
              <Pressable onPress={() => setShowMobileMenu(false)} style={styles.mobileCloseBtn}>
                <Text style={{ fontSize: 24, color: isDark ? '#fff' : '#000' }}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.mobileMenuLinks}>
              {([
                { name: 'Home', label: 'HOME' },
                { name: 'Reels', label: 'REELS' },
                { name: 'News', label: 'NEWS' }
              ] as const).map((tab) => (
                <Pressable
                  key={tab.name}
                  style={styles.mobileMenuLinkItem}
                  onPress={() => {
                    setShowMobileMenu(false);
                    navigation.navigate(tab.name);
                  }}
                >
                  <Text style={[styles.mobileMenuLinkText, { color: isDark ? '#E2E8F0' : '#334155' }]}>
                    {t(tab.label)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  dropdownBackdrop: {
    ...Platform.select({
      web: {
        position: 'fixed',
      } as any,
      default: {
        position: 'absolute',
      }
    }),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 9998,
  },
  floatingHeader: {
    ...Platform.select({
      web: {
        position: 'fixed',
      } as any,
      default: {
        position: 'absolute',
      }
    }),
    top: 0,
    left: 0,
    right: 0,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    shadowOpacity: 0.06,
    elevation: 4,
  },
  headerContentWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 1440,
    paddingLeft: 10,
    paddingRight: 20,
    height: '100%',
  },
  headerSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerSectionCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  headerSectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
    flexShrink: 0,
  },
  logoContainer: {
    marginRight: 14,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  logoImage: {
    width: 120,
    height: 120,
    ...Platform.select({
      web: {
        objectFit: 'contain' as any,
      }
    }) as any,
  },
  weatherWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  weatherIcon: {
    width: 22,
    height: 22,
    marginRight: 8,
  },
  weatherText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit',
  },
  navMenuContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
  },
  navTabButton: {
    paddingVertical: 16,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  navTabText: {
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontFamily: 'Outfit',
  },
  navTabActiveLine: {
    position: 'absolute',
    bottom: 2,
    height: 3,
    borderRadius: 1.5,
    alignSelf: 'center',
    width: '100%',
  },
  searchWrapper: {
    position: 'relative',
    zIndex: 10001,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 220,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Outfit',
    padding: 0,
  },
  voiceSearchBtn: {
    padding: 6,
    marginLeft: 6,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  micIcon: {
    width: 16,
    height: 16,
  },
  shortcutLabel: {
    backgroundColor: 'rgba(128,128,128,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  shortcutText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  searchDropdownCard: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 10002,
  },
  dropdownSection: {
    marginBottom: 10,
  },
  dropdownSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  dropdownItemText: {
    fontSize: 13,
    fontFamily: 'Outfit',
  },
  clearRecentBtn: {
    padding: 4,
  },
  aiSearchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 6,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  sparkleIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
  },
  aiSearchText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  liveButtonRed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  liveButtonText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  iconCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(128,128,128,0.06)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  circleIconGlyph: {
    width: 18,
    height: 18,
  },
  badgeIndicatorDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  verticalDivider: {
    width: 1.5,
    marginHorizontal: 4,
  },
  profileAvatarTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  profileAvatarWrapper: {
    width: 40,
    height: 40,
    position: 'relative',
  },
  profileAvatarFrame: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#E0E0E0',
  },
  premiumAvatarFrame: {
    borderColor: '#ffd24a',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  onlineStatusIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 3,
  },
  dropdownArrow: {
    fontSize: 9.5,
    marginLeft: 6,
  },
  hamburgerBtn: {
    padding: 6,
  },
  mobileMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -1000,
    padding: 24,
    zIndex: 100000,
  },
  mobileMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  mobileCloseBtn: {
    padding: 6,
  },
  mobileMenuLinks: {
    gap: 20,
  },
  mobileMenuLinkItem: {
    paddingVertical: 12,
  },
  mobileMenuLinkText: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  dropdownCard: {
    position: 'absolute',
    right: 0,
    top: 56,
    width: 280,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 100000,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  dropdownLargeAvatarContainer: {
    width: 48,
    height: 48,
    position: 'relative',
  },
  dropdownLargeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#ffd24a',
  },
  dropdownCrown: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 2,
  },
  dropdownUserDetails: {
    marginLeft: 12,
    flex: 1,
    justifyContent: 'center',
  },
  dropdownFullName: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  dropdownVerifiedTick: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownUsername: {
    fontSize: 11.5,
    fontFamily: 'Outfit',
    marginTop: 1,
  },
  dropdownStatsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 8,
    marginBottom: 12,
  },
  dropdownStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  dropdownStatVal: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  dropdownStatLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontFamily: 'Outfit',
    marginTop: 2,
  },
  dropdownOptions: {
    gap: 2,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  dropdownOptionIcon: {
    fontSize: 14,
    width: 24,
  },
  dropdownOptionText: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: 'Outfit',
    marginLeft: 4,
  },
  dropdownDivider: {
    height: 1.5,
    marginVertical: 6,
  },
  langDropdownCard: {
    position: 'absolute',
    right: 180,
    top: 56,
    width: 180,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 100000,
  },
  langDropdownTitle: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Outfit',
    paddingHorizontal: 8,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
  langDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginVertical: 2,
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  langDropdownRowActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  langOptionText: {
    fontSize: 13,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  appsDropdownCard: {
    position: 'absolute',
    right: 60,
    top: 56,
    width: 240,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 100000,
  },
  appsTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: 'Outfit',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  appsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  appGridItem: {
    width: '46%',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.04)',
    ...Platform.select({
      web: { cursor: 'pointer' }
    }) as any,
  },
  appIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  appName: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  weatherDetailsCard: {
    position: 'absolute',
    top: 56,
    left: 170,
    width: 320,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 100000,
  },
  weatherDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  weatherTitleText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  weatherStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  weatherStatCol: {
    width: '46%',
  },
  weatherStatLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'Outfit',
  },
  weatherStatVal: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Outfit',
  },
  weatherDivider: {
    height: 1,
    marginVertical: 10,
  },
  weatherSunRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weatherSunLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Outfit',
  },
  weatherSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  weatherHourlyContainer: {
    flexDirection: 'row',
    gap: 14,
  },
  weatherHourlyItem: {
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.04)',
  },
  weatherHourText: {
    fontSize: 10,
    fontFamily: 'Outfit',
  },
  weatherHourIcon: {
    fontSize: 16,
    marginVertical: 2,
  },
  weatherHourTemp: {
    fontSize: 11,
    fontWeight: '700',
  },
  weatherDailyContainer: {
    gap: 8,
  },
  weatherDailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherDailyDay: {
    fontSize: 12,
    fontWeight: '700',
    width: 40,
  },
  weatherDailyIcon: {
    fontSize: 16,
  },
  weatherDailyTemp: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
