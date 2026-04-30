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
}

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState<LoginRequest>({ email: '', password: '' });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      const destination = ROLE_HOME_MAP[result.user.role];
      router.replace(destination);
    },
  });

  const errorMessage = useMemo(() => {
    if (!mutation.error) {
      return null;
    }

    const apiError = mutation.error as AxiosError<ApiErrorResponse>;
    return apiError.response?.data?.message ?? 'Invalid credentials. Please try again.';
  }, [mutation.error]);

  const onSubmit = () => {
    mutation.mutate(form);
  };

  const isDisabled = !form.email.trim() || !form.password.trim() || mutation.isPending;

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
              onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
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

            {errorMessage ? <Text className="mb-4 text-sm text-red-700">{errorMessage}</Text> : null}

            <AppButton disabled={isDisabled} label="Sign In" loading={mutation.isPending} onPress={onSubmit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
