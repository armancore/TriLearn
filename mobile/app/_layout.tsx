import { Component, type ReactNode } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Toast, { BaseToast, ErrorToast, type ToastConfig } from 'react-native-toast-message';

import { COLORS } from '@/src/constants/colors';
import { ROLE_GROUP_MAP, ROLE_HOME_MAP } from '@/src/constants/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { queryClient } from '@/src/services/queryClient';
import { useSocket } from '@/src/hooks/useSocket';
import '../global.css';

const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#15803D' }}
      contentContainerStyle={{ paddingHorizontal: 16 }}
      text1Style={{ color: '#10233E', fontSize: 15, fontWeight: '700' }}
      text2Style={{ color: '#6B7280', fontSize: 13 }}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: '#B91C1C' }}
      contentContainerStyle={{ paddingHorizontal: 16 }}
      text1Style={{ color: '#10233E', fontSize: 15, fontWeight: '700' }}
      text2Style={{ color: '#6B7280', fontSize: 13 }}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#1A3C6E' }}
      contentContainerStyle={{ paddingHorizontal: 16 }}
      text1Style={{ color: '#10233E', fontSize: 15, fontWeight: '700' }}
      text2Style={{ color: '#6B7280', fontSize: 13 }}
    />
  ),
};

type RootErrorBoundaryProps = {
  children: ReactNode;
};

type RootErrorBoundaryState = {
  hasError: boolean;
};

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled mobile route error', error);
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center bg-slate-50 px-6">
          <Text className="text-center text-2xl font-bold text-slate-900">Something went wrong</Text>
          <Text className="mt-3 text-center text-base leading-6 text-slate-600">
            We could not load this screen. Try again, or restart the app if the problem continues.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-6 rounded-lg bg-blue-900 px-5 py-3"
            onPress={this.retry}
          >
            <Text className="font-semibold text-white">Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

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
    const roleGroup = ROLE_GROUP_MAP[user.role];
    const roleHome = ROLE_HOME_MAP[user.role];

    if (activeGroup === '(auth)') {
      return <Redirect href={roleHome} />;
    }

    if (activeGroup !== roleGroup && activeGroup !== '(profile)') {
      return <Redirect href={roleHome} />;
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <RootErrorBoundary>
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
            <Stack.Screen name="(coordinator)" options={{ headerShown: false }} />
            <Stack.Screen name="(admin)" options={{ headerShown: false }} />
            <Stack.Screen name="(gatekeeper)" options={{ headerShown: false }} />
            <Stack.Screen name="(profile)/index" options={{ title: 'Profile', headerBackTitle: 'Back' }} />
            <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
          </Stack>
        </RootErrorBoundary>
        <Toast config={toastConfig} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
