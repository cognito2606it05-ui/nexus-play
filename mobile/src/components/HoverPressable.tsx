import React, { useRef } from 'react';
import { Pressable, Animated, Platform, StyleSheet } from 'react-native';
import { colors } from '../theme';

export function HoverPressable({ children, onPress, style, ...props }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const handleHoverIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1.04, friction: 6, tension: 40, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(translateY, { toValue: -4, friction: 6, tension: 40, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(glow, { toValue: 1, duration: 150, useNativeDriver: false })
    ]).start();
  };

  const handleHoverOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(translateY, { toValue: 0, friction: 6, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(glow, { toValue: 0, duration: 150, useNativeDriver: false })
    ]).start();
  };

  const animatedStyles = {
    transform: [
      { scale },
      { translateY }
    ],
    shadowOpacity: glow.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.45]
    }),
    shadowRadius: glow.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 8]
    }),
    shadowColor: colors.primary,
    elevation: glow.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 4]
    }),
  };

  // Flatten styles to forward flexbox and layout layout definitions to the interactive Pressable
  const styleFlattened = StyleSheet.flatten(style) || {};
  
  // Layout and padding styles that should be handled by Pressable
  const layoutStyles: any = {
    flexDirection: styleFlattened.flexDirection,
    justifyContent: styleFlattened.justifyContent,
    alignItems: styleFlattened.alignItems,
    flexWrap: styleFlattened.flexWrap,
    padding: styleFlattened.padding,
    paddingHorizontal: styleFlattened.paddingHorizontal,
    paddingVertical: styleFlattened.paddingVertical,
    paddingLeft: styleFlattened.paddingLeft,
    paddingRight: styleFlattened.paddingRight,
    paddingTop: styleFlattened.paddingTop,
    paddingBottom: styleFlattened.paddingBottom,
    gap: styleFlattened.gap,
    rowGap: styleFlattened.rowGap,
    columnGap: styleFlattened.columnGap,
  };

  const pressableStyle = {
    position: 'relative',
    width: '100%',
    height: styleFlattened.height ? '100%' : undefined,
    ...layoutStyles
  };

  // Remove layout and padding styles from the parent Animated.View to avoid double styling and height collapse issues
  const viewStyle = { ...styleFlattened };
  const layoutKeys = Object.keys(layoutStyles);
  for (const key of layoutKeys) {
    delete viewStyle[key];
  }

  return (
    <Animated.View style={[viewStyle as any, animatedStyles]}>
      <Pressable
        onPress={onPress}
        onHoverIn={Platform.OS === 'web' ? handleHoverIn : undefined}
        onHoverOut={Platform.OS === 'web' ? handleHoverOut : undefined}
        style={pressableStyle as any}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
