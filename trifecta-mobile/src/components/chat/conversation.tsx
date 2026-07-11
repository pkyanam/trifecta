import { SymbolImage } from "@/components/symbol-image";
import { LiquidMetalButton } from "@/components/liquid-metal";
import { LegendList, type LegendListRef } from "@legendapp/list";
/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable animation cells. */
import {
  createContext,
  use,
  useCallback,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { LayoutChangeEvent, Text, View } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardGestureArea } from "../tw";
import { useChatContext } from "./chat-context";
import type { ChatMessage } from "./types";

const AnimatedLegendList = Animated.createAnimatedComponent(LegendList);

type AnimatedStyle = any;

type ConversationContextValue = {
  scrollToBottom: () => void;
  /** Animated style that positions the prompt input above the keyboard. */
  promptInputStyle: AnimatedStyle;
  /** Prompt input reports its measured height through this callback. */
  onPromptInputLayout: (e: LayoutChangeEvent) => void;
  /** Animated style for the scroll-to-bottom button. */
  scrollButtonStyle: AnimatedStyle;
};

const ConversationCtx = createContext<ConversationContextValue | null>(null);

export function useConversationContext() {
  const ctx = use(ConversationCtx);
  if (!ctx)
    throw new Error(
      "useConversationContext must be used within <Conversation>",
    );
  return ctx;
}

export function Conversation({
  renderMessage,
  emptyState,
  footer,
  children,
}: {
  /** Render callback for each message – passed to the underlying list. */
  renderMessage: (info: { item: ChatMessage }) => ReactElement;
  /** Element shown when the message list is empty. */
  emptyState?: ReactElement;
  footer?: ReactNode;
  /** Compound children: <ConversationScrollButton />, <PromptInput />, etc. */
  children?: ReactNode;
}) {
  const { messages } = useChatContext();
  const listRef = useRef<LegendListRef>(null);
  const insets = useSafeAreaInsets();

  // -- Keyboard tracking --------------------------------------------------

  const keyboardHeight = useSharedValue(0);
  // Separate value for contentInset that freezes during interactive dismiss
  // to prevent the scroll view from snapping when the user is overscrolled.
  const keyboardHeightForInset = useSharedValue(0);
  // Tracks whether the current keyboard transition originated from an
  // interactive dismiss gesture (vs a programmatic tap-to-open).
  const wasInteractive = useSharedValue(false);
  // -- Layout bookkeeping --------------------------------------------------

  const [composerOffsetHeight, setComposerOffsetHeight] = useState(68);
  const composerHeight = useSharedValue(68);
  const scrollViewHeight = useSharedValue(0);
  const totalContentHeight = useSharedValue(0);
  const messagesOnlyHeight = useSharedValue(0);

  // -- Auto-scroll ---------------------------------------------------------

  const scrollY = useSharedValue(0);
  const lastContentHeight = useSharedValue(0);
  const SCROLL_THRESHOLD = 50;
  // Account for safe area + iOS navigation header (~44px) + breathing room.
  // Using insets.top makes this work across all devices (notch, Dynamic Island, etc).
  const topPadding = insets.top + 52;

  const bottomInset = useDerivedValue(() => {
    const keyboard = Math.abs(keyboardHeight.value);
    return composerHeight.value + Math.max(insets.bottom, keyboard);
  });

  // Create a worklet-safe scroll function
  const scrollToBottomWorklet = useCallback(() => {
    "worklet";
    // With useAnimatedRef, we can access the ref directly in worklets
    if (listRef.current) {
      listRef.current.scrollToEnd({
        animated: true,
        viewOffset: -bottomInset.value,
      });
    }
  }, [bottomInset, listRef]);
  useKeyboardHandler(
    {
      onStart: (e) => {
        "worklet";
        // Track if keyboard is opening from a tap (not from interactive dismiss)
        if (e.height > 0 && !wasInteractive.value) {
          wasInteractive.value = false;
        }
      },
      onMove: (e) => {
        "worklet";
        keyboardHeight.value = e.height;
        keyboardHeightForInset.value = e.height;
      },
      onInteractive: (e) => {
        "worklet";
        // Only update prompt input position, not contentInset.
        // Changing contentInset during an active gesture causes a jump
        // when the user has overscrolled past the bottom.
        keyboardHeight.value = e.height;
        wasInteractive.value = true;
      },
      onEnd: (e) => {
        "worklet";
        const shouldScroll = e.height > 0 && !wasInteractive.value;
        keyboardHeight.value = e.height;
        keyboardHeightForInset.value = withTiming(e.height, { duration: 250 });
        wasInteractive.value = false;
        if (shouldScroll) {
          scrollToBottomWorklet();
        }
      },
    },
    [],
  );

  const isAtBottom = useDerivedValue(() => {
    const maxScrollY =
      totalContentHeight.value - scrollViewHeight.value + bottomInset.value;
    if (maxScrollY <= 0) return true;
    return maxScrollY - scrollY.value <= SCROLL_THRESHOLD;
  });

  const shouldShowScrollButton = useDerivedValue(() => {
    const maxScrollY =
      totalContentHeight.value - scrollViewHeight.value + bottomInset.value;
    if (maxScrollY <= 50) return false;
    return !isAtBottom.value;
  });

  // -- Callbacks -----------------------------------------------------------

  const onScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    scrollViewHeight.value = e.nativeEvent.layout.height;
  }, [scrollViewHeight]);

  const onScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollY.value = event.nativeEvent.contentOffset.y;
    },
    [scrollY],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const wasAtBottom = isAtBottom.value;
      const heightIncreased = height > lastContentHeight.value;

      totalContentHeight.value = height;
      lastContentHeight.value = height;
      // Update messagesOnlyHeight here - this is safe as it's not in a worklet
      const scrollHeight = scrollViewHeight.value;
      const keyboard = Math.abs(keyboardHeight.value);
      const bottom = composerHeight.value + Math.max(insets.bottom, keyboard);
      const blankSpace = scrollHeight - messagesOnlyHeight.value - bottom;
      const footerHeight = Math.max(0, blankSpace - topPadding);
      messagesOnlyHeight.value = height - footerHeight;

      if (wasAtBottom && heightIncreased && listRef.current) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({
            animated: true,
            viewOffset: -bottomInset.value,
          });
        });
      }
    },
    [
      bottomInset,
      composerHeight,
      insets.bottom,
      isAtBottom,
      keyboardHeight,
      lastContentHeight,
      listRef,
      messagesOnlyHeight,
      scrollViewHeight,
      topPadding,
      totalContentHeight,
    ],
  );

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({
      animated: true,
      viewOffset: -bottomInset.value,
    });
  }, [bottomInset, listRef]);

  // -- Animated styles -----------------------------------------------------

  const footerSpacerStyle = useAnimatedStyle(() => {
    const scrollHeight = scrollViewHeight.value;
    if (scrollHeight <= 0) return { height: 0 };

    const keyboard = Math.abs(keyboardHeight.value);
    const bottom = composerHeight.value + Math.max(insets.bottom, keyboard);
    // Use messagesOnlyHeight directly in calculation
    const blankSpace = scrollHeight - messagesOnlyHeight.value - bottom;
    const footerHeight = Math.max(0, blankSpace - topPadding);

    return { height: footerHeight };
  });

  const emptyStateOverlayStyle = useAnimatedStyle(() => ({
    top: topPadding,
    bottom:
      composerHeight.value +
      Math.max(insets.bottom, Math.abs(keyboardHeight.value)),
  }));

  const promptInputStyle = useAnimatedStyle(() => ({
    bottom: Math.max(insets.bottom, Math.abs(keyboardHeight.value)),
  }));

  const scrollButtonStyle = useAnimatedStyle(() => ({
    opacity: withTiming(shouldShowScrollButton.value ? 1 : 0, {
      duration: 200,
    }),
    transform: [
      {
        scale: withTiming(shouldShowScrollButton.value ? 1 : 0.8, {
          duration: 200,
        }),
      },
    ],
    bottom:
      composerHeight.value +
      Math.max(insets.bottom, Math.abs(keyboardHeight.value)) +
      12,
  }));

  const listAnimatedProps = useAnimatedProps(() => {
    const keyboard = Math.abs(keyboardHeightForInset.value);
    const bottom = composerHeight.value + Math.max(insets.bottom, keyboard);
    return {
      contentInset: { top: 0, left: 0, right: 0, bottom },
      scrollIndicatorInsets: { top: topPadding, left: 0, right: 0, bottom },
    };
  });

  const onPromptInputLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    composerHeight.value = h;
    setComposerOffsetHeight(h);
  }, [composerHeight]);

  // -- Context value -------------------------------------------------------

  const contextValue: ConversationContextValue = {
    scrollToBottom,
    promptInputStyle,
    onPromptInputLayout,
    scrollButtonStyle,
  };

  // -- Render --------------------------------------------------------------

  return (
    <ConversationCtx value={contextValue}>
      <View className="flex-1 bg-background">
        <KeyboardGestureArea
          interpolator="ios"
          showOnSwipeUp
          offset={composerOffsetHeight}
          className="flex-1"
        >
          <AnimatedLegendList
            ref={listRef}
            data={messages}
            renderItem={renderMessage as any}
            keyExtractor={(item) => (item as ChatMessage).id}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: composerOffsetHeight + Math.max(insets.bottom, 16) + 16,
            }}
            keyboardDismissMode="interactive"
            automaticallyAdjustsScrollIndicatorInsets={false}
            maintainVisibleContentPosition
            estimatedItemSize={80}
            animatedProps={listAnimatedProps}
            onLayout={onScrollViewLayout}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onContentSizeChange={onContentSizeChange}
            ListHeaderComponent={<View style={{ height: topPadding }} />}
            ListFooterComponent={
              <>
                {footer}
                <Animated.View style={footerSpacerStyle} />
              </>
            }
          />
          {!messages.length && emptyState ? (
            <Animated.View
              pointerEvents="none"
              className="absolute left-0 right-0 items-center justify-center px-6"
              style={emptyStateOverlayStyle}
            >
              {emptyState}
            </Animated.View>
          ) : null}
        </KeyboardGestureArea>

        {children}
      </View>
    </ConversationCtx>
  );
}


export function ConversationScrollButton() {
  const { scrollToBottom, scrollButtonStyle } = useConversationContext();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: "absolute", right: 16 }, scrollButtonStyle]}
    >
      <LiquidMetalButton
        onPress={scrollToBottom}
        size={40}
        accessibilityLabel="Scroll to bottom"
      >
        <SymbolImage
          name="chevron.down"
          size={20}
          style={{
            tintColor: '#ffffff',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.35,
            shadowRadius: 2,
          }}
        />
      </LiquidMetalButton>
    </Animated.View>
  );
}

export function ConversationEmptyState({
  title = "Ready",
  description,
  icon = "bubble.left.and.bubble.right",
}: {
  title?: string;
  description?: string;
  icon?: string;
}) {
  return (
    <View className="items-center justify-center gap-2">
      <SymbolImage
        name={icon}
        size={48}
        className="text-muted-foreground"
      />
      <Text className="text-xl font-semibold text-foreground">
        {title}
      </Text>
      {description && (
        <Text className="text-sm text-muted-foreground">
          {description}
        </Text>
      )}
    </View>
  );
}
