import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, useWindowDimensions, Platform } from 'react-native';
import { api } from '../api/client';
import { useTheme } from '../state/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { Translate } from '../state/LanguageContext';

export function BreakingNewsTicker() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const [tickerItems, setTickerItems] = useState<any[]>([]);
  const [listWidth, setListWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const currentTranslateX = useRef(0);
  const { width: viewportWidth } = useWindowDimensions();

  // Listen to translateX changes to keep track of current offset for pausing/resuming
  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentTranslateX.current = value;
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  const fetchTicker = async () => {
    try {
      const res = await api.getTicker();
      if (res && res.data && res.data.length > 0) {
        setTickerItems(res.data);
      } else {
        // Fallback realistic news headlines if API returns empty
        setTickerItems([
          { id: '1', title: 'PM Narendra Modi schedules high-level bilateral meeting on trade policies.', source: 'NEXUS News' },
          { id: '2', title: 'Stock Market Update: Sensex gains 450 points, Nifty trading above 23,200.', source: 'Market Watch' },
          { id: '3', title: 'Weather Alert: Heavy rainfall warning issued for coastal areas in next 24 hours.', source: 'Met Dept' },
          { id: '4', title: 'Tech Innovation: New lightweight AI models announced with 10x efficiency.', source: 'Tech Pulse' }
        ]);
      }
    } catch (err) {
      console.error('Failed to fetch ticker:', err);
    }
  };

  useEffect(() => {
    fetchTicker();
    const interval = setInterval(fetchTicker, 45000); // refresh ticker every 45s
    return () => clearInterval(interval);
  }, []);

  const startAnimation = (startValue: number) => {
    if (listWidth === 0) return;
    
    // Total distance to scroll is from startValue to -listWidth
    const distance = Math.abs(startValue - (-listWidth));
    const speed = 0.055; // pixels per ms
    const duration = distance / speed;

    if (animationRef.current) {
      animationRef.current.stop();
    }

    animationRef.current = Animated.timing(translateX, {
      toValue: -listWidth,
      duration: duration,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    });

    animationRef.current.start(({ finished }) => {
      if (finished) {
        translateX.setValue(0);
        startAnimation(0);
      }
    });
  };

  useEffect(() => {
    if (listWidth > 0 && tickerItems.length > 0) {
      translateX.setValue(0);
      startAnimation(0);
    }
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [listWidth, tickerItems.length]);

  const handleMouseEnter = () => {
    if (Platform.OS === 'web' && animationRef.current) {
      animationRef.current.stop();
    }
  };

  const handleMouseLeave = () => {
    if (Platform.OS === 'web') {
      startAnimation(currentTranslateX.current);
    }
  };

  if (tickerItems.length === 0) return null;

  return (
    <View style={[styles.tickerContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderBottomColor: colors.border }]}>
      <View style={[styles.breakingBadge, { backgroundColor: colors.breaking || '#D32F2F' }]}>
        <Text style={styles.breakingBadgeText} numberOfLines={1}>🚨 <Translate text="BREAKING" /></Text>
      </View>
      <View 
        style={styles.tickerViewport}
        {...(Platform.OS === 'web' ? {
          onMouseEnter: handleMouseEnter,
          onMouseLeave: handleMouseLeave,
        } as any : {})}
      >
        <Animated.View
          style={{
            flexDirection: 'row',
            transform: [{ translateX }],
          }}
        >
          {/* First set for measurement */}
          <View 
            style={{ flexDirection: 'row' }}
            onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
          >
            {tickerItems.map((item, idx) => (
              <Pressable
                key={`ticker-1-${item.id}-${idx}`}
                style={styles.tickerItem}
                onPress={() => {
                  navigation.navigate('News', { newsId: item.id });
                }}
              >
                <Text style={[styles.tickerText, { color: isDark ? '#F1F5F9' : '#1E293B' }]}>
                  🚨 <Text style={{ fontWeight: '700', color: colors.breaking || '#EF4444' }}><Translate text={item.source || 'Breaking'} />:</Text> <Translate text={item.title} />
                </Text>
                <Text style={styles.tickerDivider}>|</Text>
              </Pressable>
            ))}
          </View>
          {/* Second set for infinite visual wrap */}
          <View style={{ flexDirection: 'row' }}>
            {tickerItems.map((item, idx) => (
              <Pressable
                key={`ticker-2-${item.id}-${idx}`}
                style={styles.tickerItem}
                onPress={() => {
                  navigation.navigate('News', { newsId: item.id });
                }}
              >
                <Text style={[styles.tickerText, { color: isDark ? '#F1F5F9' : '#1E293B' }]}>
                  🚨 <Text style={{ fontWeight: '700', color: colors.breaking || '#EF4444' }}><Translate text={item.source || 'Breaking'} />:</Text> <Translate text={item.title} />
                </Text>
                <Text style={styles.tickerDivider}>|</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tickerContainer: {
    height: 40,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  breakingBadge: {
    paddingHorizontal: 12,
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  breakingBadgeText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 11,
    fontFamily: 'Outfit',
    letterSpacing: 0.5,
  },
  tickerViewport: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  tickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tickerText: {
    fontSize: 12.5,
    fontFamily: 'Outfit',
    fontWeight: '500',
  },
  tickerDivider: {
    color: 'rgba(128, 128, 128, 0.3)',
    fontSize: 14,
    marginHorizontal: 16,
  },
});
