export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: import("@/types/thread").ChatAttachment[];
};
