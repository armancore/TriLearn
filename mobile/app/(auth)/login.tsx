import { useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, InlineNotice, Input, Text } from '@/src/components/ui';
import { ROLE_HOME_MAP } from '@/src/constants/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { LoginRequest } from '@/src/types/auth';

interface ApiErrorResponse {
  message?: string;
  requiresCaptcha?: boolean;
  captchaChallenge?: {
    prompt: string;
    token: string;
  };
}

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { login } = useAuth();
  const [form, setForm] = useState<LoginRequest>({ email: '', password: '' });
  const [captchaPrompt, setCaptchaPrompt] = useState<string | null>(null);

  // "Next" on the email keyboard has to actually move focus, otherwise the
  // return key is a dead affordance.
  const passwordRef = useRef<TextInput>(null);
  const captchaRef = useRef<TextInput>(null);

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      setCaptchaPrompt(null);
      router.replace(ROLE_HOME_MAP[result.user.role]);
    },
    onError: (error) => {
      const apiError = error as AxiosError<ApiErrorResponse>;
      const challenge = apiError.response?.data?.captchaChallenge;

      if (apiError.response?.data?.requiresCaptcha && challenge?.token) {
        setCaptchaPrompt(challenge.prompt);
        setForm((prev) => ({ ...prev, captchaToken: challenge.token, captchaAnswer: '' }));
        // Move the user straight to the new field they have to fill in.
        requestAnimationFrame(() => captchaRef.current?.focus());
      }
    },
  });

  const errorMessage = useMemo(() => {
    if (!mutation.error) {
      return null;
    }

    const apiError = mutation.error as AxiosError<ApiErrorResponse>;
    if (!apiError.response) {
      return 'Could not reach the TriLearn server. Check your network connection and try again.';
    }

    return apiError.response?.data?.message ?? 'Invalid credentials. Please try again.';
  }, [mutation.error]);

  const isDisabled =
    !form.email.trim() ||
    !form.password.trim() ||
    Boolean(form.captchaToken && !form.captchaAnswer?.trim()) ||
    mutation.isPending;

  const onSubmit = () => {
    if (isDisabled) {
      return;
    }

    mutation.mutate({
      email: form.email.trim(),
      password: form.password,
      captchaToken: form.captchaToken,
      captchaAnswer: form.captchaAnswer?.trim(),
    });
  };

  return (
    // Only the bottom edge: the root layout already applies the top inset, and
    // insetting twice left a band of dead space above the logo.
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.xl,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
              }}
            >
              <Ionicons color="#FFFFFF" name="school" size={32} />
            </View>
            <Text accessibilityRole="header" style={{ marginTop: 18 }} variant="display">
              TriLearn
            </Text>
            <Text center style={{ marginTop: 6 }} tone="muted">
              Sign in to your college account
            </Text>
          </View>

          <Card padding="lg">
            {errorMessage ? (
              <View style={{ marginBottom: 20 }}>
                <InlineNotice description={errorMessage} title="Sign-in failed" tone="danger" />
              </View>
            ) : null}

            <Input
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              icon="mail-outline"
              keyboardType="email-address"
              label="Email address"
              onChangeText={(value) => {
                setCaptchaPrompt(null);
                setForm((prev) => ({
                  ...prev,
                  email: value,
                  captchaToken: undefined,
                  captchaAnswer: undefined,
                }));
              }}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="you@college.edu"
              required
              returnKeyType="next"
              submitBehavior="submit"
              textContentType="emailAddress"
              value={form.email}
            />

            <Input
              autoCapitalize="none"
              autoComplete="current-password"
              icon="lock-closed-outline"
              label="Password"
              onChangeText={(value) => setForm((prev) => ({ ...prev, password: value }))}
              onSubmitEditing={onSubmit}
              placeholder="Enter your password"
              ref={passwordRef}
              required
              returnKeyType={captchaPrompt ? 'next' : 'go'}
              revealable
              secureTextEntry
              textContentType="password"
              value={form.password}
            />

            {captchaPrompt ? (
              <Input
                autoCapitalize="none"
                hint="Answer the question above to confirm you are not a robot."
                icon="shield-checkmark-outline"
                keyboardType="number-pad"
                label={captchaPrompt}
                onChangeText={(value) => setForm((prev) => ({ ...prev, captchaAnswer: value }))}
                onSubmitEditing={onSubmit}
                placeholder="Your answer"
                ref={captchaRef}
                required
                returnKeyType="go"
                value={form.captchaAnswer ?? ''}
              />
            ) : null}

            <Button
              accessibilityHint="Signs you in and opens your dashboard"
              disabled={isDisabled}
              label="Sign in"
              loading={mutation.isPending}
              onPress={onSubmit}
              size="lg"
            />
          </Card>

          <View style={{ alignItems: 'center', marginTop: 28, gap: 6 }}>
            <Text center tone="subtle" variant="caption">
              Forgot your password, or no account yet?
            </Text>
            <Text center tone="muted" variant="caption">
              Your department coordinator can reset it for you.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
