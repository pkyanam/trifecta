import { AndroidGrabber } from "@/components/grabber";
import { useDrawer } from "@/components/drawer-content";
import { useActiveThread } from "@/stores/active-thread";
import { useThreadList } from "@/stores/thread-list";
import type { ProjectShell } from "@/types/thread";
import { projectDisplayName, projectDisplayPath } from "@/utils/projects";
import { useRouter } from "expo-router";
import { FolderOpen } from "lucide-react-native";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

function ProjectRow({
  project,
  onPress,
}: {
  project: ProjectShell;
  onPress: () => void;
}) {
  const displayName = projectDisplayName(project);
  const subtitle = projectDisplayPath(project);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-5 py-3.5 gap-4 active:bg-muted"
    >
      <View className="w-10 h-10 rounded-xl bg-accent/60 items-center justify-center">
        <FolderOpen size={20} strokeWidth={1.5} color="#888" />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-[16px] font-medium text-foreground">
          {displayName}
        </Text>
        {subtitle && (
          <Text numberOfLines={1} className="text-[12px] text-muted-foreground mt-0.5">
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function NewChatSheet() {
  const { projects } = useThreadList();
  const { startNewChat } = useActiveThread();
  const router = useRouter();
  const { closeDrawer } = useDrawer();

  function handleSelectProject(project: ProjectShell) {
    startNewChat(project.id);
    // Close the sheet first
    router.back();
    
    // On iOS, close the drawer and navigate to main screen
    if (Platform.OS === "ios") {
      closeDrawer();
      router.replace("/");
    }
  }

  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="android:pb-safe"
    >
      <AndroidGrabber />

      <View className="px-5 pt-4 pb-2">
        <Text className="text-[22px] font-bold text-foreground">New Chat</Text>
        <Text className="text-[14px] text-muted-foreground mt-1">
          Choose a project for this conversation
        </Text>
      </View>

      {projects.length === 0 && (
        <View className="px-5 py-8 items-center">
          <Text className="text-[15px] text-muted-foreground text-center">
            No projects found.{"\n"}Connect to your Trifecta server to see projects.
          </Text>
        </View>
      )}

      <View className="mt-2">
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            onPress={() => handleSelectProject(project)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
