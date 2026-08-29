import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  SCREEN_GUTTER,
  Screen,
  SkeletonList,
  Text,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { AdminUser, AdminUsersResponse } from '@/src/types/admin';
import type { UserRole } from '@/src/types/auth';

const ROLES: ('ALL' | UserRole)[] = ['ALL', 'STUDENT', 'INSTRUCTOR', 'COORDINATOR', 'GATEKEEPER', 'ADMIN'];

const SEARCH_DEBOUNCE_MS = 350;

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [role, setRole] = useState<'ALL' | UserRole>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const query = useQuery({
    queryKey: ['admin', 'users', role, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '25' });

      if (role !== 'ALL') {
        params.set('role', role);
      }

      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }

      return (await api.get<AdminUsersResponse>(`/admin/users?${params.toString()}`)).data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/admin/users/${id}/toggle-status`),
    onMutate: (id) => setPendingId(id),
    onError: (error) => toast.error(error, 'Could not update the account status.'),
    onSuccess: async () => {
      await query.refetch();
      toast.success('Account status updated.');
      announce('Account status updated');
    },
    onSettled: () => setPendingId(null),
  });

  const confirmToggle = (user: AdminUser) => {
    const action = user.isActive ? 'Disable' : 'Enable';

    Alert.alert(
      `${action} account`,
      user.isActive
        ? `${user.name} will not be able to sign in until the account is enabled again.`
        : `${user.name} will be able to sign in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: user.isActive ? 'destructive' : 'default',
          onPress: () => toggleMutation.mutate(user.id),
        },
      ],
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  return (
    <Screen
      header={{
        title: 'Users',
        subtitle: query.data ? `${query.data.total} matching accounts` : 'Search and manage accounts.',
        showBack: false,
      }}
      padded={false}
      scroll={false}
    >
      <FlatList
        contentContainerStyle={{
          gap: 12,
          paddingHorizontal: SCREEN_GUTTER,
          paddingTop: 8,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        data={query.data?.users ?? []}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonList count={4} lines={1} />
          ) : query.isError ? (
            <ErrorState onRetry={() => void query.refetch()} title="Could not load users" />
          ) : (
            <EmptyState
              description={
                debouncedSearch ? `Nothing matches “${debouncedSearch}”.` : 'No accounts match this filter.'
              }
              icon="person-outline"
              title="No users found"
            />
          )
        }
        ListHeaderComponent={
          <View style={{ paddingBottom: 4 }}>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              icon="search-outline"
              label="Search"
              onChangeText={setSearch}
              placeholder="Name or email"
              returnKeyType="search"
              value={search}
            />
            <FilterChips label="Role" onChange={setRole} options={ROLES} value={role} />
          </View>
        }
        refreshControl={
          <RefreshControl
            colors={[colors.primaryText]}
            onRefresh={onRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={refreshing}
            tintColor={colors.primaryText}
          />
        }
        renderItem={({ item }) => (
          <Card padding="md">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={item.name} size={42} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} variant="bodyStrong">
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 2 }} tone="muted" variant="caption">
                  {item.email}
                </Text>
              </View>
              <Badge label={item.role} tone="primary" />
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 14,
              }}
            >
              <Badge
                icon={item.isActive ? 'checkmark-circle' : 'close-circle'}
                label={item.isActive ? 'Active' : 'Disabled'}
                tone={item.isActive ? 'success' : 'danger'}
              />
              <Button
                accessibilityHint={
                  item.isActive ? `Blocks ${item.name} from signing in` : `Restores access for ${item.name}`
                }
                accessibilityLabel={`${item.isActive ? 'Disable' : 'Enable'} ${item.name}`}
                fullWidth={false}
                label={item.isActive ? 'Disable' : 'Enable'}
                loading={pendingId === item.id}
                onPress={() => confirmToggle(item)}
                size="sm"
                variant={item.isActive ? 'secondary' : 'tonal'}
              />
            </View>
          </Card>
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
