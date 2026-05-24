import { useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { AppInput } from '@/src/components/AppInput';
import { COLORS } from '@/src/constants/colors';
import { ROLE_HOME_MAP } from '@/src/constants/routes';
import { useAuth } from '@/src/hooks/useAuth';
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
  const { login } = useAuth();
  const [form, setForm] = useState<LoginRequest>({ email: '', password: '' });
  const [captchaPrompt, setCaptchaPrompt] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      setCaptchaPrompt(null);
      const destination = ROLE_HOME_MAP[result.user.role];
      router.replace(destination);
    },
    onError: (error) => {
      const apiError = error as AxiosError<ApiErrorResponse>;
      const challenge = apiError.response?.data?.captchaChallenge;

      if (apiError.response?.data?.requiresCaptcha && challenge?.token) {
        setCaptchaPrompt(challenge.prompt);
        setForm((prev) => ({
          ...prev,
          captchaToken: challenge.token,
          captchaAnswer: '',
        }));
      }
    },
  });

  const errorMessage = useMemo(() => {
    if (!mutation.error) {
      return null;
    }

    const apiError = mutation.error as AxiosError<ApiErrorResponse>;
    if (!apiError.response) {
      return 'Could not reach the TriLearn server. Check your network and API URL.';
    }

    return apiError.response?.data?.message ?? 'Invalid credentials. Please try again.';
  }, [mutation.error]);

  const onSubmit = () => {
    mutation.mutate({
      email: form.email.trim(),
      password: form.password,
      captchaToken: form.captchaToken,
      captchaAnswer: form.captchaAnswer?.trim(),
    });
  };

  const isDisabled =
    !form.email.trim() ||
    !form.password.trim() ||
    Boolean(form.captchaToken && !form.captchaAnswer?.trim()) ||
    mutation.isPending;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 px-6">
        <View className="mt-16 rounded-2xl bg-white p-6 shadow-sm">
          <Text className="text-3xl font-bold text-primary">TriLearn</Text>
          <Text className="mt-2 text-sm text-slate-500">College management app login portal</Text>

          <View className="mt-6">
            <AppInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Email"
              onChangeText={(value) => {
                setCaptchaPrompt(null);
                setForm((prev) => ({
                  ...prev,
                  email: value,
                  captchaToken: undefined,
                  captchaAnswer: undefined,
                }));
              }}
              placeholder="student@trilearn.edu"
              value={form.email}
            />
            <AppInput
              label="Password"
              onChangeText={(value) => setForm((prev) => ({ ...prev, password: value }))}
              placeholder="Enter your password"
              secureTextEntry
              value={form.password}
            />

            {captchaPrompt ? (
              <AppInput
                autoCapitalize="none"
                keyboardType="number-pad"
                label={captchaPrompt}
                onChangeText={(value) => setForm((prev) => ({ ...prev, captchaAnswer: value }))}
                placeholder="Enter answer"
                value={form.captchaAnswer ?? ''}
              />
            ) : null}

            {errorMessage ? <Text className="mb-4 text-sm text-red-700">{errorMessage}</Text> : null}

            <AppButton disabled={isDisabled} label="Sign In" loading={mutation.isPending} onPress={onSubmit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
