import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppInput } from '@/src/components/AppInput';
import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import type { AuthActivityResponse, ProfileResponse } from '@/src/types/profile';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', address: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');

  const profileQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await api.get<ProfileResponse>('/auth/me')).data });
  const activityQuery = useQuery({ queryKey: ['auth', 'activity'], queryFn: async () => (await api.get<AuthActivityResponse>('/auth/activity')).data });

  useEffect(() => {
    const user = profileQuery.data?.user;
    if (user) {
      setProfileForm({ name: user.name ?? '', phone: user.phone ?? '', address: user.address ?? '' });
    }
  }, [profileQuery.data?.user]);

  const initials = useMemo(() => (
    profileQuery.data?.user.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  ), [profileQuery.data?.user.name]);

  const updateProfile = useMutation({
    mutationFn: async () => api.patch('/auth/profile', profileForm),
    onError: (error) => toast.error(error, 'Could not update your profile.'),
    onSuccess: async () => {
      await profileQuery.refetch();
      toast.success('Profile updated.');
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (passwordForm.newPassword !== passwordForm.confirm) {
        throw new Error('Password confirmation does not match.');
      }
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
    },
    onMutate: () => setPasswordError(''),
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not change password.';
      setPasswordError(message);
      toast.error(error, message);
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed.');
    },
  });

  const logoutAll = useMutation({
    mutationFn: async () => api.post('/auth/logout-all'),
    onError: (error) => toast.error(error, 'Could not sign out all sessions.'),
    onSuccess: logout,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([profileQuery.refetch(), activityQuery.refetch()]); } finally { setRefreshing(false); }
  };

  const user = profileQuery.data?.user;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
    >
      <View className="items-center rounded-2xl bg-white p-6">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-primary">
          <Text className="text-2xl font-bold text-white">{initials}</Text>
        </View>
        <Text className="mt-4 text-xl font-bold text-slate-900">{user?.name ?? 'Profile'}</Text>
        <Text className="mt-1 text-sm text-slate-500">{user?.email}</Text>
        <Text className="mt-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{user?.role}</Text>
      </View>

      <View className="mt-6 rounded-2xl bg-white p-5">
        <Text className="mb-4 text-lg font-bold text-slate-900">Edit profile</Text>
        <AppInput label="Name" value={profileForm.name} onChangeText={(name) => setProfileForm((form) => ({ ...form, name }))} />
        <AppInput label="Phone" value={profileForm.phone} onChangeText={(phone) => setProfileForm((form) => ({ ...form, phone }))} />
        <AppInput label="Address" value={profileForm.address} onChangeText={(address) => setProfileForm((form) => ({ ...form, address }))} />
        <AppButton label="Save profile" loading={updateProfile.isPending} onPress={() => updateProfile.mutate()} />
      </View>

      <View className="mt-6 rounded-2xl bg-white p-5">
        <Text className="mb-4 text-lg font-bold text-slate-900">Change password</Text>
        <AppInput secureTextEntry label="Current password" value={passwordForm.currentPassword} onChangeText={(currentPassword) => setPasswordForm((form) => ({ ...form, currentPassword }))} />
        <AppInput secureTextEntry label="New password" value={passwordForm.newPassword} onChangeText={(newPassword) => setPasswordForm((form) => ({ ...form, newPassword }))} />
        <AppInput secureTextEntry label="Confirm password" error={passwordError} value={passwordForm.confirm} onChangeText={(confirm) => setPasswordForm((form) => ({ ...form, confirm }))} />
        <AppButton label="Change password" loading={changePassword.isPending} onPress={() => changePassword.mutate()} />
      </View>

      <View className="mt-6 rounded-2xl bg-white p-5">
        <Text className="text-lg font-bold text-slate-900">Active sessions</Text>
        {(activityQuery.data?.sessions ?? []).map((session) => (
          <View className="mt-4 border-t border-slate-100 pt-4" key={session.id}>
            <Text className="text-sm font-bold text-slate-900">{session.current ? 'Current session' : 'Session'}</Text>
            <Text className="mt-1 text-xs text-slate-500">{session.ipAddress ?? 'Unknown IP'}</Text>
            <Text className="mt-1 text-xs text-slate-500" numberOfLines={2}>{session.userAgent ?? 'Unknown device'}</Text>
          </View>
        ))}
        <View className="mt-5">
          <AppButton label="Sign out all devices" loading={logoutAll.isPending} onPress={() => logoutAll.mutate()} />
        </View>
      </View>
    </ScrollView>
  );
}
