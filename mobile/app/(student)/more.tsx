import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Alert, View } from 'react-native';

import { ThemeSetting } from '@/src/components/ThemeSetting';
import { Avatar, Badge, Card, ListRow, PressableCard, Screen, Section, Text } from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { useNotificationsStore } from '@/src/store/notifications.store';
import { useTheme } from '@/src/theme/ThemeProvider';

type MoreItem = {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
};

/** Coursework — the things you use to study. */
const ACADEMIC_ITEMS: MoreItem[] = [
  { label: 'Routine', description: 'Your weekly class timetable', icon: 'time-outline', href: '/(student)/routine' },
  { label: 'Materials', description: 'Notes and files from instructors', icon: 'folder-outline', href: '/(student)/materials' },
  { label: 'Notices', description: 'Announcements from your college', icon: 'megaphone-outline', href: '/(student)/notices' },
];

/** Being on campus — identity, attendance and getting help. */
const CAMPUS_ITEMS: MoreItem[] = [
  { label: 'ID card', description: 'Your digital student identity card', icon: 'card-outline', href: '/(student)/id-card' },
  { label: 'Scanner', description: 'Scan a class or gate attendance QR', icon: 'qr-code-outline', href: '/(student)/scanner' },
  { label: 'Support tickets', description: 'Raise and track absence requests', icon: 'ticket-outline', href: '/(student)/tickets' },
];

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** A card of rows, with dividers between but not after the last one. */
function RowGroup({ items }: { items: MoreItem[] }) {
  return (
    <Card padding="none">
      {items.map((item, index) => (
        <ListRow
          accessibilityHint={item.description}
          description={item.description}
          divider={index < items.length - 1}
          icon={item.icon}
          key={item.label}
          onPress={() => router.push(item.href)}
          title={item.label}
        />
      ))}
    </Card>
  );
}

export default function StudentMoreScreen() {
  const { colors } = useTheme();
  const { logout, user } = useAuth();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  const handleLogout = () => {
    Alert.alert('Sign out', 'Sign out of this account on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const student = user?.student;

  return (
    <Screen header={{ title: 'More', showBack: false }}>
      {/* Account header */}
      <PressableCard
        accessibilityHint="Opens your profile, password and active sessions"
        accessibilityLabel={`Profile, ${user?.name ?? 'Student'}, ${user?.email ?? ''}`}
        onPress={() => router.push('/(student)/profile')}
        padding="lg"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user?.name} size={52} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} variant="subheading">
              {user?.name ?? 'Student'}
            </Text>
            <Text numberOfLines={1} style={{ marginTop: 2 }} tone="muted" variant="caption">
              {user?.email ?? 'View profile and security'}
            </Text>
            {student?.rollNumber ? (
              <Badge
                label={student.rollNumber}
                style={{ marginTop: 8 }}
                tone="primary"
              />
            ) : null}
          </View>
          <Ionicons color={colors.textSubtle} name="chevron-forward" size={18} />
        </View>
      </PressableCard>

      <Section compact title="Academic">
        <RowGroup items={ACADEMIC_ITEMS} />
      </Section>

      <Section compact title="Campus">
        <RowGroup items={CAMPUS_ITEMS} />
      </Section>

      {/* Notifications and appearance are both preferences, so one group —
          a whole heading for a single row was wasted space. */}
      <Section compact title="Preferences">
        <Card padding="none">
          <ListRow
            accessibilityHint="Opens your notification history"
            description="Marks, notices and attendance alerts"
            icon="notifications-outline"
            meta={unreadCount > 0 ? `${unreadCount} new` : undefined}
            onPress={() => router.push('/(student)/notifications')}
            title="Notifications"
          />
          <View style={{ padding: 16, paddingTop: 18 }}>
            <ThemeSetting />
          </View>
        </Card>
      </Section>

      <Section compact title="Account">
        <Card padding="none">
          <ListRow
            accessibilityHint="Opens your profile and password settings"
            description="Details, password and active sessions"
            icon="person-circle-outline"
            onPress={() => router.push('/(student)/profile')}
            title="Profile and security"
          />
          <ListRow
            accessibilityHint="Signs you out of this device"
            divider={false}
            icon="log-out-outline"
            iconTone="danger"
            onPress={handleLogout}
            showChevron={false}
            title="Sign out"
          />
        </Card>
      </Section>

      <View accessible accessibilityLabel={`TriLearn version ${APP_VERSION}`} style={{ alignItems: 'center', marginTop: 28, gap: 3 }}>
        <Text tone="subtle" variant="caption">
          TriLearn
        </Text>
        <Text tone="subtle" variant="label">
          Version {APP_VERSION}
        </Text>
      </View>
    </Screen>
  );
}
