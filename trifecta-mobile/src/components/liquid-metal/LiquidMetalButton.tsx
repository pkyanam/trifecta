import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import {
  Canvas,
  Circle,
  Fill,
  Shader,
  Skia,
  vec,
  useClock,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LIQUID_METAL_SHADER } from './liquid-metal-shader';
import type { LiquidMetalButtonProps, LiquidMetalVariant } from './LiquidMetalButton.types';

/**
 * Variant-specific uniform adjustments
 */
const VARIANT_CONFIG: Record<LiquidMetalVariant, { turbulence: number; pressTurbulence: number }> = {
  default: { turbulence: 1, pressTurbulence: 2.8 },
  stop: { turbulence: 1.5, pressTurbulence: 3.5 },
  connect: { turbulence: 1.2, pressTurbulence: 3.0 },
  destructive: { turbulence: 1.8, pressTurbulence: 4.0 },
};

export function LiquidMetalButton({
  onPress,
  disabled = false,
  isLoading = false,
  size = 34,
  variant = 'default',
  style,
  children,
  accessibilityLabel,
}: LiquidMetalButtonProps) {
  const clock = useClock();
  const press = useSharedValue(0);
  const turbulence = useSharedValue(VARIANT_CONFIG[variant].turbulence);
  const scale = useSharedValue(1);

  const radius = size / 2;
  const isInteractive = !disabled && !isLoading;
  const config = VARIANT_CONFIG[variant];

  const gesture = Gesture.Tap()
    .enabled(isInteractive)
    .onBegin(() => {
      'worklet';
      press.value = 1;
      turbulence.value = config.pressTurbulence;
      scale.value = 0.94;
    })
    .onEnd(() => {
      'worklet';
      if (onPress) {
        runOnJS(onPress)();
      }
    })
    .onFinalize(() => {
      'worklet';
      press.value = withTiming(0, { duration: 280 });
      turbulence.value = withTiming(config.turbulence, { duration: 420 });
      scale.value = withTiming(1, { duration: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  const runtimeEffect = useMemo(() => {
    try {
      return Skia.RuntimeEffect.Make(LIQUID_METAL_SHADER);
    } catch (error) {
      console.error('Failed to create liquid metal runtime effect:', error);
      return null;
    }
  }, []);

  const uniforms = useDerivedValue(() => ({
    u_time: clock.value / 1000,
    u_resolution: vec(size, size),
    u_press: press.value,
    u_turbulence: turbulence.value,
  }));

  if (!runtimeEffect) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || isLoading}
        accessibilityLabel={accessibilityLabel}
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: disabled ? '#64748b' : '#0f172a',
          },
          style,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          children
        )}
      </Pressable>
    );
  }

  const center = size / 2;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[animatedStyle, style]} accessibilityLabel={accessibilityLabel}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor: '#050505',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(0, 0, 0, 0.06)',
          }}
        >
          <Canvas style={{ width: size, height: size }}>
            <Fill>
              <Shader source={runtimeEffect} uniforms={uniforms} />
            </Fill>
            <Circle
              cx={center}
              cy={center}
              r={radius - 0.75}
              style="stroke"
              strokeWidth={StyleSheet.hairlineWidth * 2}
              color="rgba(255, 255, 255, 0.12)"
            />
            <Circle
              cx={center}
              cy={center}
              r={radius - 0.25}
              style="stroke"
              strokeWidth={StyleSheet.hairlineWidth * 2}
              color="rgba(0, 0, 0, 0.14)"
            />
          </Canvas>
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                justifyContent: 'center',
                alignItems: 'center',
              },
            ]}
            pointerEvents="none"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              children
            )}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
