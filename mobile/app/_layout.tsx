import { Redirect, Stack, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, Text, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { useSocket } from '@/src/hooks/useSocket';
import type { UserRole } from '@/src/types/auth';
import '../global.css';

const queryClient = new QueryClient();

const roleHomeMap: Record<UserRole, '/(student)/dashboard' | '/(instructor)/dashboard'> = {
  STUDENT: '/(student)/dashboard',
  INSTRUCTOR: '/(instructor)/dashboard',
  COORDINATOR: '/(instructor)/dashboard',
  ADMIN: '/(instructor)/dashboard',
  GATEKEEPER: '/(instructor)/dashboard',
};

const roleGroupMap: Record<UserRole, '(student)' | '(instructor)'> = {
  STUDENT: '(student)',
  INSTRUCTOR: '(instructor)',
  COORDINATOR: '(instructor)',
  ADMIN: '(instructor)',
  GATEKEEPER: '(instructor)',
};

export default function RootLayout() {
  const segments = useSegments();
  const { isHydrated, isAuthenticated, user } = useAuth();
  const activeGroup = segments[0];

  useSocket();

  if (!isHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text className="mt-3 text-sm text-slate-500">Loading session...</Text>
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    if (activeGroup !== '(auth)') {
      return <Redirect href="/(auth)/login" />;
    }
  } else {
    const roleGroup = roleGroupMap[user.role];
    const roleHome = roleHomeMap[user.role];

    if (activeGroup === '(auth)') {
      return <Redirect href={roleHome} />;
    }

    if (activeGroup !== roleGroup) {
      return <Redirect href={roleHome} />;
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Stack
          screenOptions={{
            headerTintColor: '#FFFFFF',
            headerStyle: { backgroundColor: COLORS.primary },
            contentStyle: { backgroundColor: COLORS.background },
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Stack.Screen name="(auth)/login" options={{ headerTitle: 'TriLearn Login' }} />
          <Stack.Screen name="(student)" options={{ headerShown: false }} />
          <Stack.Screen name="(instructor)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
