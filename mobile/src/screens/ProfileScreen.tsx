import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { ThemeSetting } from '@/src/components/ThemeSetting';
import {
  Avatar,
  Button,
  Card,
  Divider,
  InlineNotice,
  Input,
  Screen,
  Section,
  StatTile,
  Text,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useAuth } from '@/src/hooks/useAuth';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { AuthActivityResponse, ProfileResponse } from '@/src/types/profile';

const MIN_PASSWORD_LENGTH = 8;

const formatDate = (value?: string | null) => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

/** Read-only label/value pair inside a detail card. */
const DetailRow = ({ label, value, last = false }: { label: string; value?: string | number | null; last?: boolean }) => (
  <View accessibilityLabel={`${label}: ${value || 'not set'}`} accessible style={{ paddingVertical: 14 }}>
    <Text tone="subtle" uppercase variant="label">
      {label}
    </Text>
    <Text style={{ marginTop: 4 }} variant="bodyStrong">
      {value || '—'}
    </Text>
    {last ? null : <Divider style={{ marginTop: 14, marginBottom: -14 }} />}
  </View>
);

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { logout, updateUser } = useAuth();
  const toast = useToast();
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', address: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<ProfileResponse>('/auth/me')).data,
  });

  const activityQuery = useQuery({
    queryKey: ['auth', 'activity'],
    queryFn: async () => (await api.get<AuthActivityResponse>('/auth/activity')).data,
  });

  useEffect(() => {
    const user = profileQuery.data?.user;
    if (user) {
      setProfileForm({ name: user.name ?? '', phone: user.phone ?? '', address: user.address ?? '' });
    }
  }, [profileQuery.data?.user]);

  const updateProfile = useMutation({
    mutationFn: async () => api.patch('/auth/profile', profileForm),
    onError: (error) => toast.error(error, 'Could not update your profile.'),
    onSuccess: async () => {
      await profileQuery.refetch();
      toast.success('Profile updated.');
      announce('Profile updated');
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (passwordForm.newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      }

      if (passwordForm.newPassword !== passwordForm.confirm) {
        throw new Error('Password confirmation does not match.');
      }

      const response = await api.post<{ user?: ProfileResponse['user'] }>('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      return response.data.user;
    },
    onMutate: () => setPasswordError(''),
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not change your password.';
      setPasswordError(message);
      toast.error(error, message);
    },
    onSuccess: (updatedUser) => {
      if (updatedUser) {
        updateUser({
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          mustChangePassword: Boolean(updatedUser.mustChangePassword),
          profileCompleted: updatedUser.profileCompleted,
          emailVerified: updatedUser.emailVerified,
          ...(updatedUser.student ? { student: updatedUser.student } : {}),
        });
      }

      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed.');
      announce('Password changed');
    },
  });

  const logoutAll = useMutation({
    mutationFn: async () => api.post('/auth/logout-all'),
    onError: (error) => toast.error(error, 'Could not sign out your other sessions.'),
    onSuccess: logout,
  });

  const onRefresh = useCallback(
    async () => Promise.all([profileQuery.refetch(), activityQuery.refetch()]),
    [activityQuery, profileQuery],
  );

  const confirmLogoutAll = () => {
    Alert.alert(
      'Sign out everywhere',
      'This ends every active session, including this one. You will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out all', style: 'destructive', onPress: () => logoutAll.mutate() },
      ],
    );
  };

  const user = profileQuery.data?.user;
  const sessions = activityQuery.data?.sessions ?? [];

  const roleDetail = user?.student
    ? [user.student.department, `Semester ${user.student.semester}`, user.student.section]
        .filter(Boolean)
        .join(' · ')
    : user?.instructor?.departments?.join(', ') ||
      user?.instructor?.department ||
      user?.coordinator?.department ||
      user?.role;

  const isPasswordDirty =
    passwordForm.currentPassword.length > 0 ||
    passwordForm.newPassword.length > 0 ||
    passwordForm.confirm.length > 0;

  return (
    <Screen
      header={{
        title: 'Profile',
        actions: (
          <Button
            accessibilityHint="Signs you out of this device"
            fullWidth={false}
            icon="log-out-outline"
            label="Sign out"
            onPress={logout}
            size="sm"
            variant="ghost"
          />
        ),
      }}
      onRefresh={onRefresh}
    >
      {/* Identity */}
      <Card padding="lg" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user?.name} onPrimary size={58} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: '#FFFFFF' }} tone="inherit" variant="heading">
              {user?.name ?? 'Profile'}
            </Text>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.82)', marginTop: 3 }} tone="inherit" variant="caption">
              {user?.email ?? ''}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <StatTile label="Role" onPrimary value={user?.role ?? '—'} />
          <StatTile label="Joined" onPrimary value={formatDate(user?.createdAt)} />
        </View>

        {roleDetail ? (
          <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.82)', marginTop: 14 }} tone="inherit" variant="caption">
            {roleDetail}
          </Text>
        ) : null}
      </Card>

      {profileQuery.isError ? (
        <View style={{ marginTop: 16 }}>
          <InlineNotice
            description="Pull down to retry."
            title="Could not load your profile"
            tone="danger"
          />
        </View>
      ) : null}

      {user?.mustChangePassword ? (
        <View style={{ marginTop: 16 }}>
          <InlineNotice
            description="Set a new password below before using the rest of TriLearn."
            title="Change your temporary password"
            tone="warning"
          />
        </View>
      ) : null}

      {/* Details */}
      <Section title="Details">
        <Card padding="none" style={{ paddingHorizontal: 16 }}>
          <DetailRow label="Phone" value={user?.phone} />
          <DetailRow label="Address" value={user?.address} />
          {user?.student ? (
            <>
              <DetailRow label="Roll number" value={user.student.rollNumber} />
              <DetailRow label="Section" last value={user.student.section} />
            </>
          ) : (
            <DetailRow label="Email verified" last value={user?.emailVerified ? 'Yes' : 'No'} />
          )}
        </Card>
      </Section>

      {/* Edit profile */}
      <Section description="Update how the college can reach you." title="Edit profile">
        <Card padding="lg">
          <Input
            autoComplete="name"
            icon="person-outline"
            label="Full name"
            onChangeText={(name) => setProfileForm((form) => ({ ...form, name }))}
            placeholder="Your name"
            value={profileForm.name}
          />
          <Input
            autoComplete="tel"
            icon="call-outline"
            keyboardType="phone-pad"
            label="Phone"
            onChangeText={(phone) => setProfileForm((form) => ({ ...form, phone }))}
            placeholder="Contact number"
            value={profileForm.phone}
          />
          <Input
            icon="home-outline"
            label="Address"
            multiline
            onChangeText={(address) => setProfileForm((form) => ({ ...form, address }))}
            placeholder="Where you live"
            value={profileForm.address}
          />
          <Button
            icon="checkmark"
            label="Save changes"
            loading={updateProfile.isPending}
            onPress={() => updateProfile.mutate()}
          />
        </Card>
      </Section>

      {/* Security */}
      <Section description="Choose a password you do not use anywhere else." title="Password">
        <Card padding="lg">
          <Input
            autoComplete="current-password"
            icon="lock-closed-outline"
            label="Current password"
            onChangeText={(currentPassword) => setPasswordForm((form) => ({ ...form, currentPassword }))}
            revealable
            secureTextEntry
            value={passwordForm.currentPassword}
          />
          <Input
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            icon="key-outline"
            label="New password"
            onChangeText={(newPassword) => setPasswordForm((form) => ({ ...form, newPassword }))}
            revealable
            secureTextEntry
            value={passwordForm.newPassword}
          />
          <Input
            autoComplete="new-password"
            error={passwordError}
            icon="key-outline"
            label="Confirm new password"
            onChangeText={(confirm) => setPasswordForm((form) => ({ ...form, confirm }))}
            revealable
            secureTextEntry
            value={passwordForm.confirm}
          />
          <Button
            disabled={!isPasswordDirty}
            icon="shield-checkmark-outline"
            label="Change password"
            loading={changePassword.isPending}
            onPress={() => changePassword.mutate()}
          />
        </Card>
      </Section>

      {/* Appearance */}
      <Section description="Applies to this device only." title="Appearance">
        <Card padding="lg">
          <ThemeSetting />
        </Card>
      </Section>

      {/* Sessions */}
      <Section description="Devices currently signed in to your account." title="Active sessions">
        <Card padding="lg">
          {activityQuery.isError ? (
            <Text tone="danger" variant="caption">
              Could not load your sessions. Pull down to retry.
            </Text>
          ) : sessions.length === 0 ? (
            <Text tone="muted" variant="caption">
              No other active sessions.
            </Text>
          ) : (
            sessions.map((session, index) => (
              <View key={session.id} style={{ paddingBottom: 14, paddingTop: index === 0 ? 0 : 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="bodyStrong">{session.current ? 'This device' : 'Other device'}</Text>
                  {session.current ? (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: colors.successSoft,
                      }}
                    >
                      <Text style={{ color: colors.successSoftText, fontSize: 10, fontWeight: '700' }} tone="inherit">
                        CURRENT
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={2} style={{ marginTop: 4 }} tone="muted" variant="caption">
                  {session.userAgent ?? 'Unknown device'}
                </Text>
                <Text style={{ marginTop: 2 }} tone="subtle" variant="caption">
                  {session.ipAddress ?? 'Unknown IP'} · last used {formatDateTime(session.lastUsedAt)}
                </Text>
                {index < sessions.length - 1 ? <Divider style={{ marginTop: 14 }} /> : null}
              </View>
            ))
          )}

          <Button
            accessibilityHint="Ends every session including this device"
            icon="log-out-outline"
            label="Sign out of all devices"
            loading={logoutAll.isPending}
            onPress={confirmLogoutAll}
            style={{ marginTop: 8 }}
            variant="danger"
          />
        </Card>
      </Section>
    </Screen>
  );
}
