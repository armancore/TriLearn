import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { useTheme, type ThemePreference } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

/**
 * Appearance control.
 *
 * Exposed as a radio group so assistive tech announces the current choice, and
 * each option pairs an icon with its label so the selection never depends on
 * colour alone.
 */
export function ThemeSetting() {
  const { colors, preference, setPreference, systemScheme } = useTheme();

  return (
    <View>
      <Text style={{ marginBottom: 10 }} tone="muted" uppercase variant="label">
        Appearance
      </Text>

      <View
        accessibilityLabel="App appearance"
        accessibilityRole="radiogroup"
        style={{
          flexDirection: 'row',
          gap: 6,
          padding: 4,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        {OPTIONS.map((option) => {
          const isSelected = preference === option.value;

          return (
            <Pressable
              accessibilityLabel={
                option.value === 'system' ? `System, currently ${systemScheme}` : option.label
              }
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              key={option.value}
              onPress={() => setPreference(option.value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderRadius: radius.sm,
                backgroundColor: isSelected ? colors.surface : 'transparent',
                borderWidth: 1,
                borderColor: isSelected ? colors.borderStrong : 'transparent',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Ionicons
                color={isSelected ? colors.primaryText : colors.textMuted}
                name={option.icon}
                size={16}
              />
              <Text
                style={{ color: isSelected ? colors.text : colors.textMuted, fontSize: 13, fontWeight: '600' }}
                tone="inherit"
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ marginTop: 8 }} tone="subtle" variant="caption">
        {preference === 'system'
          ? `Following your device, currently ${systemScheme}.`
          : `Always ${preference}, ignoring your device setting.`}
      </Text>
    </View>
  );
}
