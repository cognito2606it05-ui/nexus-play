import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

export function StorySkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 16 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={{ alignItems: 'center', width: 76 }}>
          <Animated.View style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: '#1E293B',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            opacity,
            marginBottom: 8
          }} />
          <Animated.View style={{
            width: 50,
            height: 10,
            borderRadius: 5,
            backgroundColor: '#1E293B',
            opacity
          }} />
        </View>
      ))}
    </View>
  );
}

export function FeedCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={styles.cardSkeleton}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Animated.View style={[styles.avatarSkeleton, { opacity }]} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Animated.View style={[styles.titleLine, { width: 140, opacity }]} />
          <Animated.View style={[styles.subTitleLine, { width: 80, opacity }]} />
        </View>
      </View>
      <Animated.View style={[styles.imageSkeleton, { opacity }]} />
      <Animated.View style={[styles.titleLine, { width: '90%', opacity, marginBottom: 8 }]} />
      <Animated.View style={[styles.titleLine, { width: '60%', opacity }]} />
    </View>
  );
}

export function NewsCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={styles.newsSkeleton}>
      <Animated.View style={[styles.newsThumbSkeleton, { opacity }]} />
      <View style={styles.newsContentSkeleton}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <Animated.View style={[styles.tagSkeleton, { opacity }]} />
          <Animated.View style={[styles.subTitleLine, { width: 60, opacity }]} />
        </View>
        <Animated.View style={[styles.titleLine, { width: '95%', opacity, marginBottom: 6 }]} />
        <Animated.View style={[styles.titleLine, { width: '80%', opacity, marginBottom: 10 }]} />
        <Animated.View style={[styles.descLine, { width: '100%', opacity, marginBottom: 6 }]} />
        <Animated.View style={[styles.descLine, { width: '70%', opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSkeleton: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    width: '100%',
  },
  avatarSkeleton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
  },
  titleLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#334155',
    marginBottom: 6,
  },
  subTitleLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#334155',
  },
  imageSkeleton: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#334155',
    marginBottom: 12,
  },
  newsSkeleton: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  newsThumbSkeleton: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#334155',
  },
  newsContentSkeleton: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  tagSkeleton: {
    width: 60,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  descLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#334155',
  },
});
