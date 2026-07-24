import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform, Modal } from 'react-native';
import { colors } from '../theme';

interface AIUploadScannerProps {
  visible: boolean;
  progress: number;
  statusText: string;
}

export function AIUploadScanner({ visible, progress, statusText }: AIUploadScannerProps) {
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Scanning line loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      ).start();

      // Glowing text pulse loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      ).start();
    } else {
      scanLineAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [visible]);

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 110], // height of scanBox minus line height
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
      <View style={styles.container}>
        <Text style={styles.title}>🛡️ NEXUS AI SafeGuard</Text>
        <Text style={styles.subTitle}>Scanning content for safety compliance</Text>

        {/* Scanning Box */}
        <View style={styles.scanBox}>
          <View style={styles.gridLines} />
          <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
          <Animated.Text style={[styles.scanText, { transform: [{ scale: pulseAnim }] }]}>
            SCANNING...
          </Animated.Text>
        </View>

        {/* Progress Bar Container */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.status}>{statusText}</Text>
            <Text style={styles.percentage}>{Math.round(progress)}%</Text>
          </View>
        </View>
      </View>
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    width: 320,
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
    textShadowColor: 'rgba(59, 130, 246, 0.5)',
    textShadowRadius: 8,
  },
  subTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 20,
  },
  scanBox: {
    width: 220,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  gridLines: {
    ...StyleSheet.absoluteFill,
    borderWidth: 0.5,
    borderColor: 'rgba(59, 130, 246, 0.06)',
    backgroundColor: 'transparent',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: '#00D8FF',
    shadowColor: '#00D8FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  scanText: {
    color: 'rgba(0, 216, 255, 0.5)',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 4,
  },
  progressContainer: {
    width: '100%',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00D8FF',
    borderRadius: 3,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  status: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  percentage: {
    color: '#00D8FF',
    fontSize: 12,
    fontWeight: '900',
  },
});
