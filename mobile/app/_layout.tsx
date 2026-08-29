import { Component, useEffect, type ReactNode } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Toast, { BaseToast, ErrorToast, type ToastConfig } from 'react-native-toast-message';

import OfflineBanner from '@/src/components/OfflineBanner';
import { Button, Text } from '@/src/components/ui';
import { ROLE_GROUP_MAP, ROLE_HOME_MAP } from '@/src/constants/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useNotifications } from '@/src/hooks/useNotifications';
import { queryClient } from '@/src/services/queryClient';
import { useSocket } from '@/src/hooks/useSocket';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeProvider';
import {
  handlePushNotificationResponse,
  handleReceivedPushNotification,
  isPushUnsupportedRuntime,
} from '@/src/services/pushNotifications';
import '../global.css';

/** Toasts are built inside the provider so they follow the active theme. */
function ThemedToast() {
  const { colors, elevation } = useTheme();

  const base = {
    contentContainerStyle: { paddingHorizontal: 16, backgroundColor: colors.surface },
    style: {
      backgroundColor: colors.surface,
      borderLeftWidth: 5,
      borderRadius: 12,
      height: 'auto' as const,
      minHeight: 62,
      paddingVertical: 10,
      ...elevation.md,
    },
    text1Style: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    text2Style: { color: colors.textMuted, fontSize: 13 },
    text1NumberOfLines: 2,
    text2NumberOfLines: 3,
  };

  const config: ToastConfig = {
    success: (props) => <BaseToast {...props} {...base} style={[base.style, { borderLeftColor: colors.success }]} />,
    error: (props) => <ErrorToast {...props} {...base} style={[base.style, { borderLeftColor: colors.danger }]} />,
    info: (props) => <BaseToast {...props} {...base} style={[base.style, { borderLeftColor: colors.primaryText }]} />,
  };

  return <Toast config={config} topOffset={60} />;
}

type RootErrorBoundaryProps = { children: ReactNode };
type RootErrorBoundaryState = { hasError: boolean };

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
      return <CrashScreen onRetry={this.retry} />;
    }

    return this.props.children;
  }
}

function CrashScreen({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityLiveRegion="assertive"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        backgroundColor: colors.background,
      }}
    >
      <Text accessibilityRole="header" center variant="title">
        Something went wrong
      </Text>
      <Text center style={{ marginTop: 12, maxWidth: 340 }} tone="muted">
        We could not load this screen. Try again, or restart the app if the problem continues.
      </Text>
      <Button
        fullWidth={false}
        icon="refresh"
        label="Try again"
        onPress={onRetry}
        style={{ marginTop: 24 }}
      />
    </View>
  );
}

/**
 * Boot cover.
 *
 * Rendered *over* the navigator rather than instead of it. Returning this in
 * place of <Stack> unmounts the navigator, and expo-router resolves the initial
 * deep link asynchronously — when that promise settles against an unmounted
 * navigator React warns "state update on a component that hasn't mounted yet".
 * Keeping the navigator mounted from the first frame avoids the race entirely.
 */
function SplashOverlay() {
  const { colors } = useTheme();

  return (
    <View
      accessibilityLabel="Loading your session"
      accessibilityLiveRegion="polite"
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
        zIndex: 10,
      }}
    >
      <ActivityIndicator color={colors.primaryText} size="large" />
      <Text style={{ marginTop: 14 }} tone="muted" variant="caption">
        Loading your session…
      </Text>
    </View>
  );
}

function AppLayout() {
  const segments = useSegments();
  const { colors, isDark, isHydrated: isThemeHydrated } = useTheme();
  const { isHydrated, isAuthenticated, user } = useAuth();
  const activeGroup = segments[0];

  useSocket();
  useNotifications();

  useEffect(() => {
    if (isPushUnsupportedRuntime) {
      return undefined;
    }

    let isMounted = true;
    let receivedSubscription: { remove: () => void } | undefined;
    let responseSubscription: { remove: () => void } | undefined;

    void import('expo-notifications').then((Notifications) => {
      if (!isMounted) {
        return;
      }

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      if (Platform.OS === 'android') {
        void Notifications.setNotificationChannelAsync('default', {
          name: 'TriLearn updates',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      receivedSubscription = Notifications.addNotificationReceivedListener(handleReceivedPushNotification);
      responseSubscription = Notifications.addNotificationResponseReceivedListener(handlePushNotificationResponse);

      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (isMounted && response) {
          handlePushNotificationResponse(response);
        }
      });
    });

    return () => {
      isMounted = false;
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, []);

  // Waiting on the theme too, so a stored light/dark choice is applied before
  // the first paint instead of flashing the default and snapping over.
  // Waiting on auth *and* theme so a stored light/dark choice applies before
  // the first paint. The navigator still mounts underneath — see SplashOverlay.
  const isBooting = !isHydrated || !isThemeHydrated;

  // Routing decisions wait until the session is known; until then the render
  // below draws the navigator with the boot overlay on top.
  if (!isBooting) {
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

      if (user.mustChangePassword && activeGroup !== '(profile)') {
        return <Redirect href="/(profile)" />;
      }

      if (activeGroup !== roleGroup && activeGroup !== '(profile)') {
        return <Redirect href={roleHome} />;
      }
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootErrorBoundary>
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
          <OfflineBanner />
          <View style={{ flex: 1 }}>
            {/*
              Navigation chrome is drawn by `ScreenHeader` inside each screen so
              titles, subtitles and actions share one layout across roles.
            */}
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(auth)/login" />
              <Stack.Screen name="(student)" />
              <Stack.Screen name="(instructor)" />
              <Stack.Screen name="(coordinator)" />
              <Stack.Screen name="(admin)" />
              <Stack.Screen name="(gatekeeper)" />
              <Stack.Screen name="(profile)/index" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </View>
          {isBooting ? <SplashOverlay /> : null}
        </SafeAreaView>
      </RootErrorBoundary>
      <ThemedToast />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppLayout />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
