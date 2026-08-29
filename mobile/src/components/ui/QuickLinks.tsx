import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Text } from './Text';

export interface QuickLink {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Small count shown on the icon, e.g. unread notices. */
  badgeCount?: number;
  hint?: string;
}

export interface QuickLinksProps {
  /** Names the row for assistive tech, e.g. "Student shortcuts". */
  label: string;
  links: QuickLink[];
}

/**
 * Compact horizontal shortcut row.
 *
 * Deliberately small: shortcuts are for destinations that are NOT already in
 * the tab bar. Duplicating tabs as large tiles wastes the most valuable part of
 * a dashboard, so keep this row to secondary destinations.
 */
export function QuickLinks({ label, links }: QuickLinksProps) {
  const { colors } = useTheme();

  return (
    <ScrollView accessibilityLabel={label} horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 10, paddingRight: 4 }}>
        {links.map((link) => (
          <Pressable
            accessibilityHint={link.hint}
            accessibilityLabel={
              link.badgeCount ? `${link.label}, ${link.badgeCount} new` : link.label
            }
            accessibilityRole="button"
            key={link.label}
            onPress={link.onPress}
            style={({ pressed }) => ({
              width: 84,
              minHeight: 84,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              paddingHorizontal: 6,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primarySoft,
              }}
            >
              <Ionicons color={colors.primarySoftText} name={link.icon} size={18} />
              {link.badgeCount && link.badgeCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                    borderRadius: radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.danger,
                    borderWidth: 2,
                    borderColor: colors.surface,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }} tone="inherit">
                    {link.badgeCount > 9 ? '9+' : link.badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text center numberOfLines={2} style={{ fontSize: 11, fontWeight: '600' }} tone="muted">
              {link.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
