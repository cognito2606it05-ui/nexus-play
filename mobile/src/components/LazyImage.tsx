import React, { useState, useEffect, useRef } from 'react';
import { Image, View, StyleSheet, ActivityIndicator, Platform, Animated } from 'react-native';

interface LazyImageProps {
  source: { uri: string } | number;
  style?: any;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'repeat' | 'center';
  placeholderColor?: string;
  blurRadius?: number;
}

export function LazyImage({ source, style, resizeMode = 'cover', placeholderColor, blurRadius }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(Platform.OS !== 'web');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const containerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px' } // Pre-load 200px before appearing
    );

    // Poll until element is ready
    const checkRef = setInterval(() => {
      const node = containerRef.current;
      if (node) {
        clearInterval(checkRef);
        const element = typeof node.getScrollableNode === 'function'
          ? node.getScrollableNode()
          : node;
        if (element && typeof element.getBoundingClientRect === 'function') {
          observer.observe(element);
        }
      }
    }, 30);

    return () => {
      clearInterval(checkRef);
      observer.disconnect();
    };
  }, []);

  const handleLoad = () => {
    setLoaded(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  if (Platform.OS === 'web' && !visible) {
    return (
      <View
        ref={containerRef}
        style={[
          styles.placeholder,
          style,
          placeholderColor ? { backgroundColor: placeholderColor } : null,
        ]}
      />
    );
  }

  return (
    <View ref={containerRef} style={[styles.container, style]}>
      {!loaded && (
        <View style={[styles.placeholder, placeholderColor ? { backgroundColor: placeholderColor } : null]}>
          <ActivityIndicator size="small" color="#3B82F6" />
        </View>
      )}
      <Animated.Image
        source={source}
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: Platform.OS === 'web' ? fadeAnim : 1,
          },
        ]}
        resizeMode={resizeMode}
        onLoad={handleLoad}
        blurRadius={blurRadius}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
