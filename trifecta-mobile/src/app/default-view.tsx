import { LiquidMetalButton } from "@/components/liquid-metal";
import { MainHeader } from "@/components/main-header";
import { SymbolImage } from "@/components/symbol-image";
import { TouchableGlass } from "@/components/touchable-glass";
import { useActiveThread } from "@/stores/active-thread";
import { useConnection } from "@/stores/connection";
import { useThreadList } from "@/stores/thread-list";
import { Redirect, useRouter } from "expo-router";
import { Text, View } from "react-native";

export default function DefaultView() {
  const { isPaired, isLoading } = useConnection();
  const { projects } = useThreadList();
  const { startNewChat } = useActiveThread();
  const router = useRouter();
  if (isLoading) return null;
  if (!isPaired) return <Redirect href="/pair" />;
  const begin = (projectId?: string) => {
    if (projectId) startNewChat(projectId);
    router.navigate("/new-chat");
  };
  return (
    <View className="flex-1 bg-background">
      <MainHeader />
      <View className="flex-1 items-center justify-center px-7">
        <View className="items-center">
          <LiquidMetalButton size={74} onPress={() => begin(projects[0]?.id)} accessibilityLabel="Start a new chat">
            <SymbolImage name="sparkles" size={30} style={{ tintColor: "#fff" }} />
          </LiquidMetalButton>
          <Text className="mt-7 text-center text-[30px] font-bold tracking-tight text-foreground">Build from anywhere.</Text>
          <Text className="mt-2 max-w-80 text-center text-base leading-6 text-muted-foreground">Your projects, agents, terminals, and changes stay synchronized with Trifecta Server.</Text>
        </View>
        <View className="mt-8 w-full max-w-md gap-2">
          {projects.slice(0, 3).map((project) => (
            <TouchableGlass key={project.id} onPress={() => begin(project.id)} className="flex-row items-center rounded-3xl px-4 py-3 active:opacity-70">
              <View className="h-9 w-9 items-center justify-center rounded-2xl bg-muted"><SymbolImage name="folder" size={18} className="text-foreground" /></View>
              <View className="ml-3 flex-1"><Text className="font-semibold text-foreground" numberOfLines={1}>{project.title}</Text><Text className="text-xs text-muted-foreground" numberOfLines={1}>{project.workspaceRoot}</Text></View>
              <SymbolImage name="arrow.up.right" size={15} className="text-muted-foreground" />
            </TouchableGlass>
          ))}
          {projects.length === 0 ? (
            <TouchableGlass onPress={() => router.navigate("/projects")} className="items-center rounded-3xl px-4 py-4 active:opacity-70"><Text className="font-semibold text-foreground">Add your first project</Text></TouchableGlass>
          ) : null}
        </View>
      </View>
    </View>
  );
}
