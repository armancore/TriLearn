import { Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Text } from './Text';

export interface FilterChipsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive tech, e.g. "Exam type". */
  label: string;
  /** Maps a raw value to display text. Defaults to title-casing. */
  formatLabel?: (option: T) => string;
}

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * Horizontal single-select filter row.
 *
 * Selection is carried by `accessibilityState.selected` (announced as
 * "selected") plus a fill *and* a border change, so the active chip is
 * distinguishable without colour perception.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  formatLabel = titleCase as (option: T) => string,
}: FilterChipsProps<T>) {
  const { colors } = useTheme();

  return (
    <ScrollView
      accessibilityLabel={label}
      accessibilityRole="tablist"
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
        {options.map((option) => {
          const isActive = option === value;

          return (
            <Pressable
              accessibilityLabel={formatLabel(option)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              hitSlop={{ top: 4, bottom: 4 }}
              key={option}
              onPress={() => onChange(option)}
              style={({ pressed }) => [
                {
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                  borderRadius: radius.full,
                  borderWidth: 1,
                  backgroundColor: isActive ? colors.primary : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                },
                pressed ? { opacity: 0.75 } : null,
              ]}
            >
              <Text
                style={{ color: isActive ? colors.textOnPrimary : colors.textMuted, fontSize: 13, fontWeight: '600' }}
                tone="inherit"
              >
                {formatLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
