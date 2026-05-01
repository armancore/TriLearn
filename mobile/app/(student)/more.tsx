import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';

type MoreItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
};

const moreItems: MoreItem[] = [
  { label: 'Routine', icon: 'time-outline', href: '/(student)/routine' },
  { label: 'Notices', icon: 'megaphone-outline', href: '/(student)/notices' },
  { label: 'Materials', icon: 'folder-outline', href: '/(student)/materials' },
  { label: 'ID Card', icon: 'card-outline', href: '/(student)/id-card' },
  { label: 'Tickets', icon: 'ticket-outline', href: '/(student)/tickets' },
  { label: 'Notifications', icon: 'notifications-outline', href: '/(student)/notifications' },
  { label: 'Scanner', icon: 'qr-code-outline', href: '/(student)/scanner' },
];

export default function StudentMoreScreen() {
  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
    >
      <Text className="text-2xl font-bold text-primary">More</Text>
      <Text className="mt-2 text-sm text-slate-600">Open student tools and resources.</Text>

      <View className="mt-6 flex-row flex-wrap gap-4">
        {moreItems.map((item) => (
          <Pressable
            key={item.label}
            className="w-[47%] rounded-2xl border border-slate-200 bg-white p-5 active:bg-slate-100"
            onPress={() => router.push(item.href)}
          >
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Ionicons color={COLORS.primary} name={item.icon} size={26} />
            </View>
            <Text className="mt-4 text-base font-bold text-slate-900">{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
