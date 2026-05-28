import React from 'react';
import { SymbolImage } from './symbol-image';
import { LiquidMetalButton } from './liquid-metal';
import type { LiquidMetalButtonProps } from './liquid-metal';

/**
 * Backward-compatible wrapper for the submit button.
 * Delegates to the shared LiquidMetalButton with default styling.
 * Shows stop icon when using 'stop' variant.
 */
export function LiquidMetalSubmitButton(props: LiquidMetalButtonProps) {
  const { children, variant = 'default', ...rest } = props;
  const size = props.size || 34;

  return (
    <LiquidMetalButton
      {...rest}
      variant={variant}
    >
      {children ?? (
        <SymbolImage
          name={variant === 'stop' ? 'stop.fill' : 'arrow.up'}
          size={size * 0.45}
          sfEffect={variant === 'stop' ? undefined : 'scale/up'}
          className="font-semibold"
          style={{
            tintColor: '#ffffff',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.35,
            shadowRadius: 2,
          }}
        />
      )}
    </LiquidMetalButton>
  );
}
