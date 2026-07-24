import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Platform, Animated, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';

import { HoverPressable } from '../components/HoverPressable';
import { NexusAssistantModal } from '../components/NexusAssistantModal';
import InstallAppPrompt from '../components/InstallAppPrompt';
import { Translate } from '../state/LanguageContext';

import HomeScreen from '../screens/HomeScreen';
import ReelsScreen from '../screens/ReelsScreen';
import NewsScreen from '../screens/NewsScreen';
import LiveScreen from '../screens/LiveScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileGate from '../screens/ProfileGate';
import MoviesScreen from '../screens/MoviesScreen';
import ReporterBroadcastScreen from '../screens/ReporterBroadcastScreen';
import StudioDashboardScreen from '../screens/StudioDashboardScreen';
import RecordedLivePlayerScreen from '../screens/RecordedLivePlayerScreen';
import TopStoriesAdminScreen from '../screens/TopStoriesAdminScreen';
import SuperAdminDashboardScreen from '../screens/SuperAdminDashboardScreen';

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Home: '⌂',
  Reels: '▶',
  Live: '◉',
  News: '▤',
  Profile: '👤',
};

const SVG_PATHS: Record<string, { paths: string[]; viewbox?: string; color: string }> = {
  Home: {
    paths: [
      'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'
    ],
    color: '#0D47A1' // Royal Blue
  },
  Reels: {
    paths: [
      'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z'
    ],
    color: '#E040FB' // Vibrant Purple for Reels
  },
  Live: {
    paths: [
      'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'
    ],
    color: '#D32F2F' // Live Red
  },
  News: {
    paths: [
      'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'
    ],
    color: '#0D47A1' // Royal Blue
  },
  Profile: {
    paths: [
      'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'
    ],
    color: '#0D47A1' // Royal Blue
  }
};

function SvgIcon({ name, color, size = 24 }: { name: string; color: string; size?: number }) {
  const config = SVG_PATHS[name];
  if (!config) return null;

  if (Platform.OS === 'web') {
    return (
      <svg
        width={size}
        height={size}
        viewBox={config.viewbox || "0 0 24 24"}
        fill="currentColor"
        style={{ color: color, filter: `drop-shadow(0px 0px 5px ${color}aa)` }}
      >
        {config.paths.map((p, idx) => (
          <path key={idx} d={p} />
        ))}
      </svg>
    );
  }

  // Native fallback
  return <Text style={{ fontSize: size, color }}>{ICONS[name]}</Text>;
}

function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const scale = useRef(new Animated.Value(focused ? 1.25 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.28 : 1,
      friction: 4,
      tension: 45,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [focused]);

  const activeColor = focused ? SVG_PATHS[name].color : 'rgba(124, 126, 140, 0.7)';

  return (
    <Animated.View style={{ transform: [{ scale }], alignItems: 'center', justifyContent: 'center' }}>
      <SvgIcon name={name} color={activeColor} size={24} />
      {focused && (
        <View
          style={{
            position: 'absolute',
            bottom: -8,
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: SVG_PATHS[name].color,
            shadowColor: SVG_PATHS[name].color,
            shadowOpacity: 0.8,
            shadowRadius: 4,
            elevation: 4
          }}
        />
      )}
    </Animated.View>
  );
}

// Resolution-safe require statements for assets in parent directory
const PRIMARY_LOGO = require('../../assets/nexuslogo.png');

function CustomSplashScreen({ onComplete, styles }: { onComplete: () => void; styles: any }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.75)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fast, battery-optimized GPU accelerated animation sequence
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }),
    ]).start();

    // Finish splash after 1.2s
    const timer = setTimeout(onComplete, 1200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <LinearGradient
      colors={['#090D1A', '#0B1528', '#02040A']}
      style={styles.splashContainer}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <View style={styles.splashOverlay}>
        <Animated.Image
          source={PRIMARY_LOGO}
          style={[
            styles.primaryLogo,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            }
          ]}
          resizeMode="contain"
        />
        <Animated.Text style={[styles.splashTagline, { opacity: fadeAnim }]}>
          BBC & CNN-INSPIRED PREMIUM NEWS & OTT HUB
        </Animated.Text>
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
        </View>
      </View>
    </LinearGradient>
  );
}

function LivePulseDot({ styles }: { styles: any }) {
  const pulseScale = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 2.5,
          duration: 1400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.liveIndicatorContainer}>
      <Animated.View
        style={[
          styles.livePulseRing,
          {
            transform: [{ scale: pulseScale }],
            opacity: pulseOpacity,
          },
        ]}
      />
      <View style={styles.liveSolidDot} />
    </View>
  );
}

function HoverTabButton({ name, focused, isHovered, onPress, onLongPress, onMouseEnter, onMouseLeave, styles, isDesktop }: any) {
  const scale = useRef(new Animated.Value(focused ? 1.15 : 1)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.15 : (isHovered ? 1.08 : 1),
      friction: 5,
      tension: 50,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [focused, isHovered]);

  const activeColor = focused
    ? SVG_PATHS[name].color
    : (isHovered ? SVG_PATHS[name].color : '#7c7e8c');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      {...(Platform.OS === 'web' ? {
        onMouseEnter,
        onMouseLeave,
      } as any : {})}
      style={isDesktop ? styles.tabButtonDesktop : styles.tabButton}
    >
      <Animated.View
        style={[
          isDesktop ? styles.iconContainerDesktop : styles.iconContainer,
          {
            transform: [{ scale }],
            shadowColor: SVG_PATHS[name].color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.35 : (isHovered ? 0.15 : 0),
            shadowRadius: focused ? 6 : (isHovered ? 3 : 0),
            elevation: focused ? 3 : (isHovered ? 1 : 0),
            backgroundColor: focused
              ? (isDesktop ? 'rgba(59, 130, 246, 0.12)' : 'rgba(13, 71, 161, 0.12)')
              : (isHovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent'),
            borderColor: focused
              ? (isDesktop ? 'rgba(59, 130, 246, 0.25)' : 'rgba(13, 71, 161, 0.25)')
              : (isHovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent'),
          }
        ]}
        {...(Platform.OS === 'web' ? {
          className: 'transition-all duration-300 ease-out flex items-center relative'
        } as any : {})}
      >
        <SvgIcon name={name} color={activeColor} size={22} />
        {isDesktop && (
          <Text style={[
            styles.tabLabelDesktop,
            { color: activeColor, fontWeight: focused ? '700' : '500' }
          ]}>
            <Translate text={name === 'Live' ? 'Live TV' : name} />
          </Text>
        )}
        {name === 'Live' && <LivePulseDot styles={styles} />}
        {focused && !isDesktop && (
          <View
            style={[
              styles.dot,
              {
                backgroundColor: SVG_PATHS[name].color,
                shadowColor: SVG_PATHS[name].color,
                shadowOpacity: 0.8,
                shadowRadius: 4,
                elevation: 4
              }
            ]}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, width, insets, isDark);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMouseOver, setIsMouseOver] = useState(false);

  const handleMouseMove = (e: any) => {
    if (Platform.OS !== 'web') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
  };

  const handleMouseEnter = () => {
    setIsMouseOver(true);
  };

  const handleMouseLeave = () => {
    setIsMouseOver(false);
    setHoveredIndex(null);
  };

  const tabCount = state.routes.length;
  const isDesktop = Platform.OS === 'web' && width >= 768;
  if (isDesktop) return null;

  return (
    <View
      style={isDesktop ? styles.sidebarContainer : styles.tabBarContainer}
      {...(Platform.OS === 'web' ? {
        onMouseMove: handleMouseMove,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        className: isDesktop
          ? 'transition-all duration-500 ease-out border border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.3)]'
          : 'transition-all duration-500 ease-out hover:border-white/20 hover:shadow-[0_0_30px_rgba(31,156,255,0.25)]'
      } as any : {})}
    >
      {isDesktop && (
        <View style={styles.sidebarLogoContainer}>
          <Image source={PRIMARY_LOGO} style={styles.sidebarLogo} resizeMode="contain" />
        </View>
      )}

      <View style={isDesktop ? styles.tabButtonsColumn : styles.tabButtonsRow}>
        {state.routes.map((route: any, index: number) => {
          if (!ICONS[route.name]) return null;
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <HoverTabButton
              key={route.key}
              name={route.name}
              focused={isFocused}
              isHovered={hoveredIndex === index}
              onPress={onPress}
              onLongPress={onLongPress}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              styles={styles}
              isDesktop={isDesktop}
            />
          );
        })}
      </View>
    </View>
  );
}

function MainTabs() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneContainerStyle: {
          flex: 1,
          minHeight: Platform.OS === 'web' ? '100vh' : '100%',
          width: '100%',
          backgroundColor: 'transparent',
        }
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Reels" component={ReelsScreen} />
      <Tab.Screen name="News" component={NewsScreen} />
      <Tab.Screen name="Live" component={LiveScreen} initialParams={{ mode: 'live' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="ReporterBroadcast" component={ReporterBroadcastScreen} />
      <Tab.Screen name="StudioDashboard" component={StudioDashboardScreen} />
      <Tab.Screen name="RecordedLivePlayer" component={RecordedLivePlayerScreen} />
      <Tab.Screen name="TopStoriesAdmin" component={TopStoriesAdminScreen} />
      <Tab.Screen name="SuperAdminDashboard" component={SuperAdminDashboardScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, width, insets, isDark);
  const { loading, user, activeProfile } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    // Session is persisted; no forced signOut on reload for better testing experience

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);

        const style = document.createElement('style');
        style.textContent = `
          * {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          }
        `;
        document.head.appendChild(style);
      } catch (e) { }
    }
  }, []);

  if (loading || !splashDone) {
    return <CustomSplashScreen styles={styles} onComplete={() => setSplashDone(true)} />;
  }
  if (!user) return <LoginScreen />;
  if (!activeProfile) return <ProfileGate />;
  return (
    <View style={{
      flex: 1,
      backgroundColor: 'transparent',
      ...Platform.select({
        web: {
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
        }
      }) as any
    }}>
      <MainTabs />
      <InstallAppPrompt />
    </View>
  );
}

const getStyles = (colors: any, width: number, insets: any, isDark = false) => StyleSheet.create({
  splashContainer: { flex: 1, backgroundColor: '#090D1A', position: 'relative' },
  splashVideo: { ...StyleSheet.absoluteFill },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryLogo: {
    width: 280,
    height: 90,
    marginBottom: 12,
  },
  splashTagline: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 36,
  },
  progressBarBg: {
    width: 180,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    height: 60 + (insets?.bottom ?? 0),
    paddingBottom: insets?.bottom ?? 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 99999,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }
    }) as any,
  },
  sidebarContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    bottom: 16,
    width: 230,
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.75)' : 'rgba(255, 255, 255, 0.75)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    paddingVertical: 32,
    paddingHorizontal: 16,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 99999,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }
    }) as any,
  },
  sidebarLogoContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 48,
    width: '100%',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  sidebarLogo: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  tabButtonsColumn: {
    flexDirection: 'column',
    gap: 12,
    width: '100%',
  },
  tabButtonDesktop: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
  },
  iconContainerDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  tabLabelDesktop: {
    fontSize: 15,
    marginLeft: 12,
    fontFamily: 'Outfit',
  },
  tabButtonsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 1,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    bottom: 1,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  floatingAiBtn: {
    position: 'absolute',
    bottom: 104,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(16, 185, 129, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }
    }) as any,
  },
  floatingAiText: {
    fontSize: 24,
  },
  liveIndicatorContainer: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePulseRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveSolidDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
});

