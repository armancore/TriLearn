import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import type { AdminUser, AdminUsersResponse } from '@/src/types/admin';
import type { UserRole } from '@/src/types/auth';

const roles: Array<'ALL' | UserRole> = ['ALL', 'STUDENT', 'INSTRUCTOR', 'COORDINATOR', 'GATEKEEPER', 'ADMIN'];

export default function AdminUsersScreen() {
  const [role, setRole] = useState<'ALL' | UserRole>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);

    return () => clearTimeout(timeout);
  }, [search]);

  const query = useQuery({
    queryKey: ['admin', 'users', role, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '25',
      });

      if (role !== 'ALL') {
        params.set('role', role);
      }

      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }

      const url = `/admin/users?${params.toString()}`;
      return (await api.get<AdminUsersResponse>(url)).data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/admin/users/${id}/toggle-status`),
    onError: (error) => toast.error(error, 'Could not update user status.'),
    onSuccess: async () => {
      await query.refetch();
      toast.success('User status updated.');
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const renderUser = ({ item }: { item: AdminUser }) => (
    <View className="rounded-2xl bg-white p-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-base font-bold text-slate-900">{item.name}</Text>
          <Text className="mt-1 text-sm text-slate-500">{item.email}</Text>
        </View>
        <View className="rounded-full bg-blue-100 px-3 py-1">
          <Text className="text-xs font-bold text-blue-700">{item.role}</Text>
        </View>
      </View>
      <View className="mt-4 flex-row items-center justify-between">
        <Text className={`text-sm font-bold ${item.isActive ? 'text-green-700' : 'text-red-700'}`}>
          {item.isActive ? 'Active' : 'Inactive'}
        </Text>
        <Pressable className="rounded-xl bg-slate-100 px-4 py-2" onPress={() => toggleMutation.mutate(item.id)}>
          <Text className="text-sm font-bold text-primary">{item.isActive ? 'Disable' : 'Enable'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 32 }}
        data={query.data?.users ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text className="text-2xl font-bold text-primary">Users</Text>
            <TextInput className="mt-4 rounded-2xl bg-white px-4 py-3 text-slate-900" placeholder="Search name or email" value={search} onChangeText={setSearch} />
            <FlatList
              className="mt-4"
              horizontal
              data={roles}
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable className={`mr-2 rounded-full px-4 py-2 ${role === item ? 'bg-primary' : 'bg-white'}`} onPress={() => setRole(item)}>
                  <Text className={`text-xs font-bold ${role === item ? 'text-white' : 'text-slate-600'}`}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? <View className="h-24 rounded-2xl bg-white" /> : <Text className="rounded-2xl bg-white p-5 text-center text-slate-500">No users found</Text>
        }
        refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
        renderItem={renderUser}
      />
    </View>
  );
}
