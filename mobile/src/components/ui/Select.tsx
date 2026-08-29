import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radius } from '@/src/theme/tokens';

import { Sheet } from './Sheet';
import { Text } from './Text';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectProps<T extends string> {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Title of the picker sheet. Defaults to `Select {label}`. */
  sheetTitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}

/**
 * Dropdown-style picker.
 *
 * Native `<Picker>` styling is inconsistent across platforms, so this opens a
 * sheet of radio options instead: the trigger announces the current value, and
 * each option reports its selected state rather than relying on a tick colour.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  sheetTitle,
  icon,
  disabled = false,
}: SelectProps<T>) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <>
      <Pressable
        accessibilityHint="Opens a list of options"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: isOpen }}
        disabled={disabled}
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH_TARGET + 14,
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
          opacity: disabled ? 0.55 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {icon ? <Ionicons color={colors.textSubtle} name={icon} size={18} /> : null}
          <View style={{ flex: 1 }}>
            <Text tone="subtle" uppercase variant="label">
              {label}
            </Text>
            <Text numberOfLines={1} style={{ marginTop: 3 }} tone={selected ? 'default' : 'muted'} variant="bodyStrong">
              {selected?.label ?? placeholder}
            </Text>
          </View>
          <Ionicons color={colors.textSubtle} name="chevron-down" size={18} />
        </View>
      </Pressable>

      <Sheet onClose={() => setIsOpen(false)} title={sheetTitle ?? `Select ${label.toLowerCase()}`} visible={isOpen}>
        <ScrollView accessibilityLabel={label} accessibilityRole="radiogroup" style={{ maxHeight: 420 }}>
          <View style={{ gap: 8 }}>
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <Pressable
                  accessibilityLabel={option.description ? `${option.label}. ${option.description}` : option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected }}
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: MIN_TOUCH_TARGET + 8,
                    padding: 14,
                    borderRadius: radius.md,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? colors.primaryText : colors.border,
                    backgroundColor: isSelected ? colors.primarySoft : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{option.label}</Text>
                    {option.description ? (
                      <Text style={{ marginTop: 2 }} tone="muted" variant="caption">
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? <Ionicons color={colors.primaryText} name="checkmark-circle" size={20} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Sheet>
    </>
  );
}
