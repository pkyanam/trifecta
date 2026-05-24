import Svg, {
  Defs,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Image, useColorScheme } from "react-native";

type Props = { driver: string; label?: string; size?: number };

function driverToKind(driver: string) {
  switch (driver) {
    case "claudeAgent":
    case "claude":
    case "anthropic":
    case "anthropicChat":
      return "claude";
    case "codex":
    case "openai":
    case "openaiChat":
    case "openAIChat":
    case "openaiResponses":
      return "openai";
    case "opencode":
      return "opencode";
    case "cursor":
      return "cursor";
    case "gemini":
    case "googleGemini":
    case "google":
      return "gemini";
    case "copilot":
    case "githubCopilot":
    case "githubcopilot":
    case "github_copilot":
      return "copilot";
    case "antigravity":
      return "antigravity";
    case "hermesAgent":
    case "hermes":
      return "hermes";
    case "devinAgent":
    case "devin":
      return "devin";
    default:
      return "other";
  }
}

function ClaudeIcon({ size }: { size: number }) {
  return (
    <Svg viewBox="0 0 256 257" width={size} height={size}>
      <Path
        // Anthropic orange asterisk — path from trifecta-desktop Icons.tsx ClaudeAI
        d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
        fill="#d97757"
      />
    </Svg>
  );
}

function OpenAIIcon({ size, isDark }: { size: number; isDark: boolean }) {
  return (
    <Svg viewBox="0 0 256 260" width={size} height={size}>
      <Path
        // Six-pointed knot from trifecta-desktop Icons.tsx OpenAI
        d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"
        fill={isDark ? "#ffffff" : "#000000"}
      />
    </Svg>
  );
}

function OpenCodeIcon({ size, isDark }: { size: number; isDark: boolean }) {
  const frameColor = isDark ? "#F1ECEC" : "#211E1E";
  const innerColor = isDark ? "#4B4646" : "#CFCECD";
  return (
    // 32×40 viewBox, scale width proportionally
    <Svg viewBox="0 0 32 40" width={size * 0.8} height={size}>
      <Path d="M24 32H8V16H24V32Z" fill={innerColor} />
      <Path
        d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z"
        fill={frameColor}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function CursorIcon({ size, isDark }: { size: number; isDark: boolean }) {
  return (
    <Svg viewBox="0 0 466.73 532.09" width={size} height={size}>
      <Path
        // Cursor cube from trifecta-desktop Icons.tsx CursorIcon
        d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
        fill={isDark ? "#EDECEC" : "#26251E"}
      />
    </Svg>
  );
}

function GeminiIcon({ size }: { size: number }) {
  const path =
    "M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z";

  return (
    <Svg viewBox="0 0 296 298" width={size} height={size}>
      <Defs>
        <RadialGradient id="gem-blue" cx="62%" cy="50%" rx="70%" ry="58%">
          <Stop offset="0%" stopColor="#3689FF" />
          <Stop offset="100%" stopColor="#3689FF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="gem-yellow" cx="11%" cy="48%" rx="42%" ry="42%">
          <Stop offset="0%" stopColor="#F6C013" />
          <Stop offset="100%" stopColor="#F6C013" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="gem-red" cx="50%" cy="0%" rx="50%" ry="55%">
          <Stop offset="0%" stopColor="#FA4340" />
          <Stop offset="100%" stopColor="#FA4340" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="gem-green" cx="48%" cy="100%" rx="52%" ry="55%">
          <Stop offset="0%" stopColor="#14BB69" />
          <Stop offset="100%" stopColor="#14BB69" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={path} fill="#3689FF" />
      <Path d={path} fill="url(#gem-yellow)" />
      <Path d={path} fill="url(#gem-red)" />
      <Path d={path} fill="url(#gem-green)" />
      <Path d={path} fill="url(#gem-blue)" opacity={0.9} />
    </Svg>
  );
}

function CopilotIcon({ size, isDark }: { size: number; isDark: boolean }) {
  return (
    <Svg viewBox="0 0 256 208" width={size} height={size}>
      <Path
        // Copilot face from trifecta-desktop Icons.tsx GithubCopilotIcon
        d="M205.3 31.4c14 14.8 20 35.2 22.5 63.6 6.6 0 12.8 1.5 17 7.2l7.8 10.6c2.2 3 3.4 6.6 3.4 10.4v28.7a12 12 0 0 1-4.8 9.5C215.9 187.2 172.3 208 128 208c-49 0-98.2-28.3-123.2-46.6a12 12 0 0 1-4.8-9.5v-28.7c0-3.8 1.2-7.4 3.4-10.5l7.8-10.5c4.2-5.7 10.4-7.2 17-7.2 2.5-28.4 8.4-48.8 22.5-63.6C77.3 3.2 112.6 0 127.6 0h.4c14.7 0 50.4 2.9 77.3 31.4ZM128 78.7c-3 0-6.5.2-10.3.6a27.1 27.1 0 0 1-6 12.1 45 45 0 0 1-32 13c-6.8 0-13.9-1.5-19.7-5.2-5.5 1.9-10.8 4.5-11.2 11-.5 12.2-.6 24.5-.6 36.8 0 6.1 0 12.3-.2 18.5 0 3.6 2.2 6.9 5.5 8.4C79.9 185.9 105 192 128 192s48-6 74.5-18.1a9.4 9.4 0 0 0 5.5-8.4c.3-18.4 0-37-.8-55.3-.4-6.6-5.7-9.1-11.2-11-5.8 3.7-13 5.1-19.7 5.1a45 45 0 0 1-32-12.9 27.1 27.1 0 0 1-6-12.1c-3.4-.4-6.9-.5-10.3-.6Zm-27 44c5.8 0 10.5 4.6 10.5 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.6-10.4 10.4-10.4Zm53.4 0c5.8 0 10.4 4.6 10.4 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.7-10.4 10.4-10.4Zm-73-94.4c-11.2 1.1-20.6 4.8-25.4 10-10.4 11.3-8.2 40.1-2.2 46.2A31.2 31.2 0 0 0 75 91.7c6.8 0 19.6-1.5 30.1-12.2 4.7-4.5 7.5-15.7 7.2-27-.3-9.1-2.9-16.7-6.7-19.9-4.2-3.6-13.6-5.2-24.2-4.3Zm69 4.3c-3.8 3.2-6.4 10.8-6.7 19.9-.3 11.3 2.5 22.5 7.2 27a41.7 41.7 0 0 0 30 12.2c8.9 0 17-2.9 21.3-7.2 6-6.1 8.2-34.9-2.2-46.3-4.8-5-14.2-8.8-25.4-9.9-10.6-1-20 .7-24.2 4.3ZM128 56c-2.6 0-5.6.2-9 .5.4 1.7.5 3.7.7 5.7 0 1.5 0 3-.2 4.5 3.2-.3 6-.3 8.5-.3 2.6 0 5.3 0 8.5.3-.2-1.6-.2-3-.2-4.5.2-2 .3-4 .7-5.7-3.4-.3-6.4-.5-9-.5Z"
        fill={isDark ? "#ffffff" : "#000000"}
      />
    </Svg>
  );
}

// Embedded PNG from trifecta-desktop Icons.tsx AntigravityIcon
const ANTIGRAVITY_URI =
  "data:image/png;base64,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";

function AntigravityIcon({ size }: { size: number }) {
  void ANTIGRAVITY_URI;
  return <GeminiIcon size={size} />;
}

function AssetIcon({
  source,
  size,
}: {
  source: number;
  size: number;
}) {
  return (
    <Image
      source={source}
      style={{
        width: size,
        height: size,
        borderRadius: 2,
      }}
      resizeMode="contain"
    />
  );
}

function initials(label: string): string {
  const words = label.replace(/[_-]+/g, " ").split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function OtherIcon({ size, driver, label }: { size: number; driver: string; label?: string }) {
  const text = initials(label ?? driver);
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b"];
  const hash = driver.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const bg = colors[hash % colors.length];
  return (
    <Svg viewBox="0 0 32 32" width={size} height={size}>
      <Path d="M4 0h24a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z" fill={bg} />
      <SvgText
        x="16"
        y="20"
        fill="#ffffff"
        fontSize="11"
        fontWeight="700"
        textAnchor="middle"
      >
        {text}
      </SvgText>
    </Svg>
  );
}

export function ProviderIcon({ driver, label, size = 24 }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  switch (driverToKind(driver)) {
    case "claude":
      return <ClaudeIcon size={size} />;
    case "openai":
      return <OpenAIIcon size={size} isDark={isDark} />;
    case "opencode":
      return <OpenCodeIcon size={size} isDark={isDark} />;
    case "cursor":
      return <CursorIcon size={size} isDark={isDark} />;
    case "gemini":
      return <GeminiIcon size={size} />;
    case "copilot":
      return <CopilotIcon size={size} isDark={isDark} />;
    case "antigravity":
      return <AntigravityIcon size={size} />;
    case "hermes":
      return (
        <AssetIcon
          source={require("../assets/provider-icons/hermes-logo.jpg")}
          size={size}
        />
      );
    case "devin":
      return (
        <AssetIcon
          source={require("../assets/provider-icons/devin-logo-square.png")}
          size={size}
        />
      );
    default:
      return <OtherIcon size={size} driver={driver} label={label} />;
  }
}
