import type { ViewStyle } from 'react-native';

export type LiquidMetalVariant = 'default' | 'stop' | 'connect' | 'destructive';

export interface LiquidMetalButtonProps {
  onPress?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  size?: number;
  variant?: LiquidMetalVariant;
  style?: ViewStyle;
  children?: React.ReactNode;
  accessibilityLabel?: string;
}
