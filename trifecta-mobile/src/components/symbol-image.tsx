import { Image as ExpoImage, ImageProps, type ImageStyle } from "expo-image";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Check,
  CheckCircle,
  ChevronDown,
  Copy,
  Cpu,
  ExternalLink,
  FileText,
  Folder,
  GitBranch,
  HelpCircle,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";

import { withUniwind } from "uniwind";

const Image = withUniwind(ExpoImage);

/**
 * Map of SF Symbol names to Lucide icons for Android/web fallback.
 */
const LUCIDE_FALLBACKS: Record<string, LucideIcon> = {
  // Arrows
  "arrow.up": ArrowUp,
  "arrow.down": ArrowDown,
  "arrow.up.right.square": ExternalLink,
  "arrow.triangle.branch": GitBranch,
  "arrow.triangle.2.circlepath": RefreshCw,
  // Chevrons
  "chevron.down": ChevronDown,
  // Actions
  plus: Plus,
  "xmark": X,
  "xmark.circle.fill": XCircle,
  "checkmark": Check,
  "checkmark.circle.fill": CheckCircle,
  "checkmark.seal": BadgeCheck,
  // Navigation
  "line.3.horizontal": Menu,
  "ellipsis": MoreHorizontal,
  // Git
  "branch": GitBranch,
  // System
  "cpu": Cpu,
  "gearshape": Settings,
  "gearshape.fill": Settings,
  "magnifyingglass": Search,
  "trash": Trash2,
  "folder": Folder,
  "doc.text": FileText,
  "rectangle.on.rectangle": Copy,
  "exclamationmark.triangle": AlertTriangle,
  "exclamationmark.triangle.fill": AlertTriangle,
  // Chat/messaging
  "bubble.left.and.bubble.right": MessageSquare,
};

type SymbolImageProps = {
  /** SF Symbol name (e.g. "arrow.up", "chevron.down") */
  name: string;
  size?: number;
  tintColor?: string;
  style?: ImageStyle;
  className?: string;
  sfEffect?: ImageProps["sfEffect"];
  transition?: ImageProps["transition"];
};

export function SymbolImage({
  name,
  size = 24,
  tintColor,
  style,
  className,
  sfEffect,
  transition,
}: SymbolImageProps) {
  if (process.env.EXPO_OS === "ios") {
    return (
      <Image
        sfEffect={sfEffect}
        transition={transition}
        source={`sf:${name}`}
        style={[{ width: size, height: size }, style]}
        tintColor={tintColor}
        className={className}
      />
    );
  }

  const Icon = LUCIDE_FALLBACKS[name] ?? HelpCircle;
  return <Icon size={size} color={tintColor} style={style as any} />;
}
