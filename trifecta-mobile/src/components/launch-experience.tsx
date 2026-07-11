import { LIQUID_METAL_SHADER } from "@/components/liquid-metal/liquid-metal-shader";
import { Canvas, Circle, Fill, Group, Shader, Skia, vec, useClock } from "@shopify/react-native-skia";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";

void SplashScreen.preventAutoHideAsync();

export function LaunchExperience({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.86);
  const reduceMotion = useSharedValue(0);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      reduceMotion.value = reduced ? 1 : 0;
      scale.value = withTiming(1, {
        duration: reduced ? 1 : 520,
        easing: Easing.out(Easing.exp),
      });
      opacity.value = withDelay(
        reduced ? 80 : 720,
        withTiming(0, { duration: reduced ? 120 : 260 }, (finished) => {
          if (finished) runOnJS(setVisible)(false);
        }),
      );
    });
    return () => { active = false; };
  }, [opacity, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.root} onLayout={() => void SplashScreen.hideAsync()}>
      {children}
      {visible ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.overlay, animatedStyle]}
        >
          <MetalMark width={width} height={height} reduceMotion={reduceMotion} />
          <Text style={styles.wordmark}>TRIFECTA</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function MetalMark({ width, height, reduceMotion }: { width: number; height: number; reduceMotion: SharedValue<number> }) {
  const clock = useClock();
  const effect = useMemo(() => Skia.RuntimeEffect.Make(LIQUID_METAL_SHADER), []);
  const size = Math.min(220, width * 0.52);
  const uniforms = useDerivedValue(() => ({
    u_time: reduceMotion.value ? 0.35 : clock.value / 1000,
    u_resolution: vec(size, size),
    u_press: 0,
    u_turbulence: 0.82,
  }));
  const centerX = width / 2;
  const centerY = height / 2 - 28;
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill color="#09090b" />
      {effect ? (
        <Group clip={{ x: centerX - size / 2, y: centerY - size / 2, width: size, height: size }}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Group>
      ) : null}
      <Circle cx={centerX} cy={centerY - 37} r={54} style="stroke" strokeWidth={18} color="#f5f5f4" opacity={0.92} />
      <Circle cx={centerX - 34} cy={centerY + 25} r={54} style="stroke" strokeWidth={18} color="#d6d3d1" opacity={0.82} />
      <Circle cx={centerX + 34} cy={centerY + 25} r={54} style="stroke" strokeWidth={18} color="#a8a29e" opacity={0.74} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { backgroundColor: "#09090b", alignItems: "center", justifyContent: "center" },
  wordmark: { position: "absolute", top: "63%", color: "#fafaf9", fontSize: 13, fontWeight: "700", letterSpacing: 5.5 },
});
