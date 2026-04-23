import { Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { useAuth } from '@/src/hooks/useAuth';

export default function InstructorDashboardScreen() {
  const { user, logout } = useAuth();

  return (
    <View className="flex-1 p-6">
      <View className="rounded-2xl bg-white p-5">
        <Text className="text-xl font-bold text-primary">Welcome, {user?.fullName}</Text>
        <Text className="mt-2 text-sm text-slate-600">Role: {user?.role}</Text>
        <Text className="mt-3 text-slate-700">Manage courses, assessments, and classroom updates from this dashboard.</Text>
      </View>
      <View className="mt-6">
        <AppButton label="Logout" onPress={logout} />
      </View>
    </View>
  );
}
