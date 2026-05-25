import { MainHeader } from "@/components/main-header";
import { useConnection } from "@/stores/connection";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Text, View, useColorScheme, Platform } from "react-native";

export default function DefaultView() {
  const { isPaired, isLoading } = useConnection();
  const [mounted, setMounted] = useState(false);
  const colorScheme = useColorScheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isLoading) return null;
  if (!isPaired) return <Redirect href="/pair" />;
  if (!mounted) return null;

  // Platform-specific arrow positioning
  const isAndroid = Platform.OS === "android";
  const arrowStyle = {
    position: "absolute" as const,
    left: isAndroid ? 33 : 36,
    top: isAndroid ? 7 : 87,
    width: isAndroid ? 256 : 240,
    height: isAndroid ? 256 : 240,
    transform: [{ rotate: "15deg" }],
  };

  return (
    <View className="flex-1">
      <MainHeader />
      <View className="flex-1 items-center justify-center px-8 relative">
        <Image
          source={require("../../assets/images/blackArrow.png")}
          style={arrowStyle}
          resizeMode="contain"
          tintColor={colorScheme === "dark" ? "#FFFFFF" : "#000000"}
        />
        <View className="items-center gap-4">
          <Text className="text-2xl font-bold text-foreground text-center">
            Welcome to Trifecta
          </Text>
          <Text className="text-base text-muted-foreground text-center">
            Open the sidebar to start a new thread
          </Text>
        </View>
      </View>
    </View>
  );
}