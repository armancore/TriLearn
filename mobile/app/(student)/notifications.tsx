import { FlatList, Text, View } from 'react-native';

import { useNotifications } from '@/src/hooks/useNotifications';

export default function StudentNotificationsScreen() {
  const { notifications, isLoading } = useNotifications();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-slate-500">Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 p-6">
      <FlatList
        contentContainerStyle={{ gap: 10 }}
        data={notifications}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text className="text-center text-slate-500">No notifications available.</Text>}
        renderItem={({ item }) => (
          <View className="rounded-2xl bg-white p-4">
            <Text className="text-base font-semibold text-primary">{item.title}</Text>
            <Text className="mt-1 text-slate-700">{item.message}</Text>
            <Text className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
        )}
      />
    </View>
  );
}
