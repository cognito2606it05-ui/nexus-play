import React, { useRef, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { HoverPressable } from './HoverPressable';
import { LazyImage } from './LazyImage';
import { useTheme } from '../state/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { Translate } from '../state/LanguageContext';

interface CarouselProps {
  data: any[];
  loading: boolean;
  onPressStory?: (id: string) => void;
}

export function TopStoriesCarousel({ data, loading, onPressStory }: CarouselProps) {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 768;

  const cardWidth = isDesktop ? 300 : 250;
  const gap = 16;

  if (loading) {
    return (
      <View style={styles.carouselContainer}>
        <Text style={[styles.title, { color: colors.text, paddingHorizontal: 16 }]}>🔥 <Translate text="Top Stories" /></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
              <View style={[styles.skeletonImage, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />
              <View style={styles.skeletonTextContainer}>
                <View style={[styles.skeletonCategory, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />
                <View style={[styles.skeletonTitle, { backgroundColor: isDark ? '#334155' : '#CBD5E1', width: '90%' }]} />
                <View style={[styles.skeletonTitle, { backgroundColor: isDark ? '#334155' : '#CBD5E1', width: '60%' }]} />
                <View style={[styles.skeletonSource, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (!data || data.length === 0) return null;

  if (Platform.OS === 'web') {
    return (
      <WebMarquee
        data={data}
        cardWidth={cardWidth}
        gap={gap}
        colors={colors}
        isDark={isDark}
        navigation={navigation}
        onPressStory={onPressStory}
        windowWidth={windowWidth}
      />
    );
  }

  return (
    <MobileCarousel
      data={data}
      cardWidth={cardWidth}
      gap={gap}
      colors={colors}
      isDark={isDark}
      navigation={navigation}
      onPressStory={onPressStory}
    />
  );
}

function WebMarquee({ data, cardWidth, gap, colors, isDark, navigation, onPressStory, windowWidth }: any) {
  const containerRef = useRef<any>(null);
  const trackRef = useRef<any>(null);
  const [isGrabbing, setIsGrabbing] = useState(false);

  const totalSetWidth = (cardWidth + gap) * data.length;
  // Duplicate set enough times to cover the viewport width and enable infinite looping
  const repeatCount = Math.max(2, Math.ceil((windowWidth * 2) / totalSetWidth) + 1);

  const displayItems = React.useMemo(() => {
    const items = [];
    for (let i = 0; i < repeatCount; i++) {
      items.push(...data);
    }
    return items;
  }, [data, repeatCount]);

  const translateX = useRef(0);
  const isHovered = useRef(false);
  const isDragging = useRef(false);
  const isResettingAfterDrag = useRef(false);

  const startX = useRef(0);
  const startTranslateX = useRef(0);
  const hasDragged = useRef(false);
  const clickStartX = useRef(0);
  const clickStartY = useRef(0);

  const resumeTimeout = useRef<any>(null);
  const animationFrameId = useRef<number | null>(null);

  const speed = 0.035; // Pixels per millisecond

  useEffect(() => {
    let lastTimestamp = 0;

    const scrollStep = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const elapsed = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      // Safe elapsed time to prevent extreme jumping when tab loses focus
      const safeElapsed = Math.min(elapsed, 32);

      if (!isDragging.current && !isHovered.current && !isResettingAfterDrag.current) {
        translateX.current -= safeElapsed * speed;

        // Reset to 0 when translating past one full set width
        if (translateX.current <= -totalSetWidth) {
          translateX.current += totalSetWidth;
        }

        if (trackRef.current) {
          trackRef.current.style.transform = `translate3d(${translateX.current}px, 0, 0)`;
        }
      }

      animationFrameId.current = requestAnimationFrame(scrollStep);
    };

    animationFrameId.current = requestAnimationFrame(scrollStep);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (resumeTimeout.current) {
        clearTimeout(resumeTimeout.current);
      }
    };
  }, [totalSetWidth]);

  const handleMouseEnter = () => {
    isHovered.current = true;
  };

  const handleMouseLeave = () => {
    isHovered.current = false;
    if (isDragging.current) {
      handleMouseUp();
    }
  };

  const handleMouseDown = (e: any) => {
    isDragging.current = true;
    setIsGrabbing(true);
    hasDragged.current = false;
    startX.current = e.clientX;
    clickStartX.current = e.clientX;
    clickStartY.current = e.clientY;
    startTranslateX.current = translateX.current;

    if (resumeTimeout.current) {
      clearTimeout(resumeTimeout.current);
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDragging.current) return;

    const deltaX = e.clientX - startX.current;
    const clickDeltaX = e.clientX - clickStartX.current;
    const clickDeltaY = e.clientY - clickStartY.current;

    if (Math.hypot(clickDeltaX, clickDeltaY) > 15) {
      hasDragged.current = true;
    }

    let newTranslateX = startTranslateX.current + deltaX;

    while (newTranslateX > 0) {
      newTranslateX -= totalSetWidth;
    }
    while (newTranslateX <= -totalSetWidth) {
      newTranslateX += totalSetWidth;
    }

    translateX.current = newTranslateX;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${translateX.current}px, 0, 0)`;
    }
  };

  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsGrabbing(false);

    if (hasDragged.current) {
      setTimeout(() => {
        hasDragged.current = false;
      }, 100);
    }

    isResettingAfterDrag.current = true;
    if (resumeTimeout.current) {
      clearTimeout(resumeTimeout.current);
    }
    resumeTimeout.current = setTimeout(() => {
      isResettingAfterDrag.current = false;
    }, 2500);
  };

  const handleTouchStart = (e: any) => {
    isDragging.current = true;
    hasDragged.current = false;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    clickStartX.current = touch.clientX;
    clickStartY.current = touch.clientY;
    startTranslateX.current = translateX.current;

    if (resumeTimeout.current) {
      clearTimeout(resumeTimeout.current);
    }
  };

  const handleTouchMove = (e: any) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX.current;
    const clickDeltaX = touch.clientX - clickStartX.current;
    const clickDeltaY = touch.clientY - clickStartY.current;

    if (Math.hypot(clickDeltaX, clickDeltaY) > 15) {
      hasDragged.current = true;
    }

    let newTranslateX = startTranslateX.current + deltaX;

    while (newTranslateX > 0) {
      newTranslateX -= totalSetWidth;
    }
    while (newTranslateX <= -totalSetWidth) {
      newTranslateX += totalSetWidth;
    }

    translateX.current = newTranslateX;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${translateX.current}px, 0, 0)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (hasDragged.current) {
      setTimeout(() => {
        hasDragged.current = false;
      }, 100);
    }

    isResettingAfterDrag.current = true;
    if (resumeTimeout.current) {
      clearTimeout(resumeTimeout.current);
    }
    resumeTimeout.current = setTimeout(() => {
      isResettingAfterDrag.current = false;
    }, 2500);
  };

  return (
    <View style={styles.carouselContainer}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>🔥 <Translate text="Top Stories" /></Text>
        <View style={styles.liveIndicatorContainer}>
          <View style={styles.liveDot} />
          <Text style={[styles.liveText, { color: isDark ? '#94A3B8' : '#64748B' }]}><Translate text="LIVE FEED" /></Text>
        </View>
      </View>

      <View {...({
        ref: containerRef,
        onMouseDown: handleMouseDown,
        onMouseMove: handleMouseMove,
        onMouseUp: handleMouseUp,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        style: [
          styles.webContainer,
          {
            cursor: isGrabbing ? 'grabbing' : 'grab',
          } as any
        ]
      } as any)}
      >
        <View
          ref={trackRef}
          style={[
            styles.webTrack,
            {
              gap: gap,
            } as any
          ]}
        >
          {displayItems.map((item, idx) => (
            <HoverPressable
              key={`top-story-${item.id}-${idx}`}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.85)' : '#FFFFFF',
                  borderColor: colors.border
                }
              ]}
              onPress={() => {
                if (hasDragged.current) return;
                if (onPressStory) {
                  onPressStory(item.id);
                } else {
                  navigation.navigate('News', { newsId: item.id });
                }
              }}
            >
              <View style={[
                styles.imageWrapper,
                item.needsBlur && Platform.OS === 'web' && { filter: 'blur(20px)', WebkitFilter: 'blur(20px)' } as any
              ]}>
                <LazyImage 
                  source={{ uri: item.imageUrl }} 
                  style={styles.cardImage as any} 
                  blurRadius={item.needsBlur ? 20 : 0}
                />
                <View style={styles.imageOverlayGradient} />
              </View>
              <View style={styles.textBlock}>
                <View style={styles.metaRow}>
                  <Text style={[styles.categoryText, { color: colors.primary }]}><Translate text={item.category} /></Text>
                  {item.readMinutes && (
                    <Text style={[styles.readTimeText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      ⏱️ {item.readMinutes} <Translate text="m read" />
                    </Text>
                  )}
                </View>
                <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={2}>
                  <Translate text={item.title} />
                </Text>
                <Text style={[styles.sourceText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                  {item.source} · {timeAgo(item.publishedAt)}
                </Text>
              </View>
            </HoverPressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function MobileCarousel({ data, cardWidth, gap, colors, isDark, navigation, onPressStory }: any) {
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!data || data.length <= 1) return;

    const totalSetWidth = (cardWidth + gap) * data.length;
    let animationFrameId: number;
    let lastTimestamp = 0;
    const speed = 0.035;

    const scrollStep = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const elapsed = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      const safeElapsed = Math.min(elapsed, 32);

      if (!isDragging.current) {
        scrollX.current += safeElapsed * speed;
        if (scrollX.current >= totalSetWidth) {
          scrollX.current -= totalSetWidth;
        }
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ x: scrollX.current, animated: false });
        }
      }

      animationFrameId = requestAnimationFrame(scrollStep);
    };

    animationFrameId = requestAnimationFrame(scrollStep);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [data, cardWidth]);

  const displayItems = [...data, ...data, ...data];

  return (
    <View style={styles.carouselContainer}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>🔥 <Translate text="Top Stories" /></Text>
        <View style={styles.liveIndicatorContainer}>
          <View style={styles.liveDot} />
          <Text style={[styles.liveText, { color: isDark ? '#94A3B8' : '#64748B' }]}><Translate text="LIVE FEED" /></Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { isDragging.current = true; }}
        onScrollEndDrag={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
          isDragging.current = false;
        }}
        onMomentumScrollEnd={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
          isDragging.current = false;
        }}
      >
        {displayItems.map((item, idx) => (
          <HoverPressable
            key={`top-story-${item.id}-${idx}`}
            style={[
              styles.card,
              {
                width: cardWidth,
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.85)' : '#FFFFFF',
                borderColor: colors.border
              }
            ]}
            onPress={() => {
              if (onPressStory) {
                onPressStory(item.id);
              } else {
                navigation.navigate('News', { newsId: item.id });
              }
            }}
          >
            <View style={[
              styles.imageWrapper,
              item.needsBlur && Platform.OS === 'web' && { filter: 'blur(20px)', WebkitFilter: 'blur(20px)' } as any
            ]}>
              <LazyImage 
                source={{ uri: item.imageUrl }} 
                style={styles.cardImage as any} 
                blurRadius={item.needsBlur ? 20 : 0}
              />
              <View style={styles.imageOverlayGradient} />
            </View>
            <View style={styles.textBlock}>
              <View style={styles.metaRow}>
                <Text style={[styles.categoryText, { color: colors.primary }]}><Translate text={item.category} /></Text>
                {item.readMinutes && (
                  <Text style={[styles.readTimeText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                    ⏱️ {item.readMinutes} <Translate text="m read" />
                  </Text>
                )}
              </View>
              <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={2}>
                <Translate text={item.title} />
              </Text>
              <Text style={[styles.sourceText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                {item.source} · {timeAgo(item.publishedAt)}
              </Text>
            </View>
          </HoverPressable>
        ))}
      </ScrollView>
    </View>
  );
}

function timeAgo(iso: string) {
  if (!iso) return 'Just now';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  carouselContainer: {
    marginVertical: 18,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Outfit',
  },
  liveIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  webContainer: {
    overflow: 'hidden',
    width: '100%',
    position: 'relative',
    ...({
      userSelect: 'none',
      WebkitUserSelect: 'none',
    } as any)
  },
  webTrack: {
    flexDirection: 'row',
    paddingLeft: 16,
    paddingRight: 16,
    ...({
      width: 'max-content',
      willChange: 'transform',
    } as any)
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  imageWrapper: {
    width: '100%',
    height: 140,
    position: 'relative',
    backgroundColor: '#000000',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlayGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  textBlock: {
    padding: 14,
    justifyContent: 'space-between',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  readTimeText: {
    fontSize: 10.5,
    fontFamily: 'Outfit',
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: 'Outfit',
    lineHeight: 18.5,
    marginBottom: 8,
  },
  sourceText: {
    fontSize: 11,
    fontFamily: 'Outfit',
  },
  skeletonCard: {
    width: 250,
    borderRadius: 16,
    overflow: 'hidden',
    height: 240,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  skeletonImage: {
    width: '100%',
    height: 130,
  },
  skeletonTextContainer: {
    padding: 12,
    gap: 6,
  },
  skeletonCategory: {
    width: 60,
    height: 10,
    borderRadius: 5,
  },
  skeletonTitle: {
    height: 12,
    borderRadius: 6,
  },
  skeletonSource: {
    width: 80,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
});
