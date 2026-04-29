import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { AppInput } from '@/src/components/AppInput';
import { COLORS } from '@/src/constants/colors';
import { useAuth } from '@/src/hooks/useAuth';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import type { AuthActivityResponse, ProfileResponse } from '@/src/types/profile';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
};

const DetailRow = ({ label, value }: { label: string; value?: string | number | null }) => (
  <View className="border-b border-slate-100 py-3">
    <Text className="text-xs font-semibold uppercase text-slate-400">{label}</Text>
    <Text className="mt-1 text-base font-semibold text-slate-900">{value || '-'}</Text>
  </View>
);

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
  const roleDetail = user?.student
    ? `${user.student.department || 'Department'} · Sem ${user.student.semester}${user.student.section ? ` · ${user.student.section}` : ''}`
    : user?.instructor?.departments?.join(', ') || user?.instructor?.department || user?.coordinator?.department || user?.role;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
    >
      <View className="rounded-3xl bg-primary p-6">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-row flex-1 items-center gap-4">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-white/15">
              <Text className="text-xl font-bold text-white">{initials}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-bold text-white">{user?.name ?? 'Profile'}</Text>
              <Text className="mt-1 text-sm font-medium text-blue-100">{user?.email}</Text>
              <Text className="mt-2 text-xs font-semibold text-blue-100">{roleDetail}</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Logout"
            className="h-11 w-11 items-center justify-center rounded-full bg-white/15 active:opacity-80"
            onPress={logout}
          >
            <Ionicons color="#FFFFFF" name="log-out-outline" size={22} />
          </Pressable>
        </View>

        <View className="mt-6 flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-white/10 p-3">
            <Text className="text-xs font-medium text-blue-100">Role</Text>
            <Text className="mt-1 text-sm font-bold text-white">{user?.role ?? '-'}</Text>
          </View>
          <View className="flex-1 rounded-2xl bg-white/10 p-3">
            <Text className="text-xs font-medium text-blue-100">Joined</Text>
            <Text className="mt-1 text-sm font-bold text-white">{formatDate(user?.createdAt)}</Text>
          </View>
        </View>
      </View>

      {profileQuery.isError ? (
        <Text className="mt-4 rounded-2xl bg-white p-4 text-center text-red-600">Could not load profile. Pull down to retry.</Text>
      ) : null}

      <View className="mt-6 rounded-2xl bg-white px-5">
        <DetailRow label="Phone" value={user?.phone} />
        <DetailRow label="Address" value={user?.address} />
        {user?.student ? (
          <>
            <DetailRow label="Roll number" value={user.student.rollNumber} />
            <DetailRow label="Section" value={user.student.section} />
          </>
        ) : null}
      </View>

      <View className="mt-6 rounded-2xl bg-white p-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">Edit Profile</Text>
          <Ionicons color={COLORS.primary} name="person-outline" size={22} />
        </View>
        <AppInput label="Name" value={profileForm.name} onChangeText={(name) => setProfileForm((form) => ({ ...form, name }))} />
        <AppInput label="Phone" value={profileForm.phone} onChangeText={(phone) => setProfileForm((form) => ({ ...form, phone }))} />
        <AppInput label="Address" value={profileForm.address} onChangeText={(address) => setProfileForm((form) => ({ ...form, address }))} />
        <AppButton label="Save profile" loading={updateProfile.isPending} onPress={() => updateProfile.mutate()} />
      </View>

      <View className="mt-6 rounded-2xl bg-white p-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">Security</Text>
          <Ionicons color={COLORS.primary} name="shield-checkmark-outline" size={22} />
        </View>
        <AppInput secureTextEntry label="Current password" value={passwordForm.currentPassword} onChangeText={(currentPassword) => setPasswordForm((form) => ({ ...form, currentPassword }))} />
        <AppInput secureTextEntry label="New password" value={passwordForm.newPassword} onChangeText={(newPassword) => setPasswordForm((form) => ({ ...form, newPassword }))} />
        <AppInput secureTextEntry label="Confirm password" error={passwordError} value={passwordForm.confirm} onChangeText={(confirm) => setPasswordForm((form) => ({ ...form, confirm }))} />
        <AppButton label="Change password" loading={changePassword.isPending} onPress={() => changePassword.mutate()} />
      </View>

      <View className="mt-6 rounded-2xl bg-white p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">Active Sessions</Text>
          <Pressable onPress={logout}>
            <Text className="text-sm font-bold text-red-600">Logout</Text>
          </Pressable>
        </View>
        {activityQuery.isError ? (
          <Text className="mt-3 text-sm text-red-600">Could not load sessions. Pull down to retry.</Text>
        ) : null}
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
