import { Ionicons } from '@expo/vector-icons';
import { useId, useState, type Ref } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { MAX_FONT_SCALE, MIN_TOUCH_TARGET, radius } from '@/src/theme/tokens';

import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label: string;
  /** Validation message. Announced to assistive tech when it appears. */
  error?: string;
  /** Static guidance shown under the field. */
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Adds a show/hide toggle for password fields. */
  revealable?: boolean;
  required?: boolean;
  /**
   * Forwarded to the underlying TextInput so screens can chain focus between
   * fields — the "next" return key needs a target to move to. React 19 passes
   * `ref` as an ordinary prop, so no forwardRef wrapper is needed.
   */
  ref?: Ref<TextInput>;
}

/**
 * Labelled text field.
 *
 * The visible label is also the accessible name, errors are exposed through a
 * live region and `accessibilityInvalid` rather than colour alone, and the
 * focus state is drawn with a 2pt ring so it survives high-contrast modes.
 */
export function Input({
  label,
  error,
  hint,
  icon,
  revealable = false,
  required = false,
  secureTextEntry,
  multiline,
  editable = true,
  style,
  onFocus,
  onBlur,
  ref,
  ...props
}: InputProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const labelId = useId();

  const hasError = Boolean(error);
  const isSecure = secureTextEntry && !(revealable && isRevealed);

  const borderColor = hasError ? colors.danger : isFocused ? colors.primaryText : colors.border;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text nativeID={labelId} style={{ marginBottom: 6 }} tone="muted" variant="label">
        {label}
        {required ? <Text tone="danger" variant="label">{' *'}</Text> : null}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: multiline ? 116 : MIN_TOUCH_TARGET,
          borderRadius: radius.md,
          borderWidth: isFocused || hasError ? 2 : 1,
          borderColor,
          backgroundColor: editable ? colors.surface : colors.surfaceMuted,
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        {icon ? (
          <Ionicons
            color={isFocused ? colors.primaryText : colors.textSubtle}
            name={icon}
            size={18}
            style={multiline ? { marginTop: 14 } : undefined}
          />
        ) : null}

        <TextInput
          accessibilityHint={hint}
          accessibilityLabel={label}
          accessibilityLabelledBy={labelId}
          accessibilityState={{ disabled: !editable }}
          editable={editable}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          multiline={multiline}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={colors.textSubtle}
          ref={ref}
          secureTextEntry={isSecure}
          style={[
            {
              flex: 1,
              paddingVertical: 12,
              fontSize: 15,
              lineHeight: 20,
              color: colors.text,
            },
            multiline ? { minHeight: 92, textAlignVertical: 'top' } : null,
            style,
          ]}
          {...props}
        />

        {revealable && secureTextEntry ? (
          <Pressable
            accessibilityLabel={isRevealed ? 'Hide password' : 'Show password'}
            accessibilityRole="button"
            accessibilityState={{ selected: isRevealed }}
            hitSlop={8}
            onPress={() => setIsRevealed((value) => !value)}
            // A real 44pt box, not just hitSlop: `hitSlop` is a no-op on web.
            style={{ width: 44, height: 44, marginRight: -8, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons color={colors.textSubtle} name={isRevealed ? 'eye-off-outline' : 'eye-outline'} size={20} />
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}
        >
          <Ionicons color={colors.danger} name="alert-circle" size={14} />
          <Text style={{ flex: 1 }} tone="danger" variant="caption">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text style={{ marginTop: 6 }} tone="subtle" variant="caption">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
