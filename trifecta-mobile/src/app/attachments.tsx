import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";
import * as ImagePicker from "expo-image-picker";
import type { LucideIcon } from "lucide-react-native";
import { Camera, Image as ImageIcon } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

const IS_IOS = process.env.EXPO_OS === "ios";

function AttachmentButton({
  icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center gap-2 py-3 rounded-xl bg-secondary active:bg-muted border-continuous"
    >
      <Icon icon={icon} className="w-6 h-6 text-foreground" />
      <Text className="text-[13px] text-foreground">{label}</Text>
    </Pressable>
  );
}

async function openCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return;
  await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] });
}

async function openPhotos() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return;
  await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
}

export default function AddToChatSheet() {
  return (
    <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic">
      <AndroidGrabber />
      <View className="flex-row gap-3 px-5 pt-2 pb-4">
        <AttachmentButton
          icon={Camera}
          label="Camera"
          onPress={IS_IOS ? openCamera : undefined}
        />
        <AttachmentButton
          icon={ImageIcon}
          label="Photos"
          onPress={IS_IOS ? openPhotos : undefined}
        />
      </View>
    </ScrollView>
  );
}
