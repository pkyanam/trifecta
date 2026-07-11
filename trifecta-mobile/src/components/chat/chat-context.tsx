import { createContext, use } from "react";
import type { StreamingStore } from "./streaming-store";
import type { ChatMessage } from "./types";
import type { UploadChatAttachment } from "@/types/thread";

export type ChatContextValue = {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isGenerating: boolean;
  onSend: () => void;
  onStop: () => void;
  streamingStore: StreamingStore;
  error?: string | null;
  attachments: UploadChatAttachment[];
  addAttachments: (attachments: UploadChatAttachment[]) => void;
  removeAttachment: (name: string) => void;
  cursorPosition: number;
  setCursorPosition: (position: number) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider = ChatContext.Provider;

export function useChatContext() {
  const ctx = use(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within <Chat>");
  return ctx;
}
