import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  SCREEN_GUTTER,
  Screen,
  Sheet,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { StudentApplication, StudentApplicationsResponse } from '@/src/types/admin';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export default function AdminApplicationsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<StudentApplication | null>(null);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [form, setForm] = useState({ studentId: '', department: '', semester: '', section: '' });

  const query = useQuery({
    queryKey: ['admin', 'applications', 'PENDING'],
    queryFn: async () =>
      (
        await api.get<StudentApplicationsResponse>(
          '/admin/student-applications?status=PENDING&page=1&limit=50',
        )
      ).data,
  });

  const reviewMutation = useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/admin/student-applications/${id}/status`, { status: 'REVIEWED' }),
    onMutate: (id) => setPendingReviewId(id),
    onError: (error) => toast.error(error, 'Could not mark the application as reviewed.'),
    onSuccess: async () => {
      await query.refetch();
      toast.success('Application marked as reviewed.');
    },
    onSettled: () => setPendingReviewId(null),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selected) {
        return;
      }

      await api.post(`/admin/student-applications/${selected.id}/create-account`, {
        studentId: form.studentId.trim(),
        department: form.department.trim() || selected.preferredDepartment,
        semester: Number(form.semester || selected.preferredSemester),
        section: form.section.trim() || selected.preferredSection || '',
      });
    },
    onError: (error) => toast.error(error, 'Could not create the student account.'),
    onSuccess: async () => {
      setSelected(null);
      await query.refetch();
      toast.success('Student account created.');
      announce('Student account created');
    },
  });

  const openCreate = (application: StudentApplication) => {
    setSelected(application);
    setForm({
      studentId: '',
      department: application.preferredDepartment,
      semester: String(application.preferredSemester),
      section: application.preferredSection ?? '',
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const canCreate = form.studentId.trim().length > 0 && Number(form.semester) > 0;

  return (
    <>
      <Screen
        header={{
          title: 'Applications',
          subtitle: query.data ? `${query.data.total} pending` : 'Student intake requests.',
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
          data={query.data?.applications ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            query.isLoading ? (
              <SkeletonList count={3} />
            ) : query.isError ? (
              <ErrorState onRetry={() => void query.refetch()} title="Could not load applications" />
            ) : (
              <EmptyState
                description="New student intake requests will appear here."
                icon="checkmark-done-outline"
                title="No pending applications"
              />
            )
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
            <Card padding="lg">
              <Text numberOfLines={1} variant="subheading">
                {item.name}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 3 }} tone="muted" variant="caption">
                {item.email}
                {item.phone ? ` · ${item.phone}` : ''}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <StatTile icon="business-outline" label="Department" value={item.preferredDepartment} />
                <StatTile icon="layers-outline" label="Semester" value={item.preferredSemester} />
                <StatTile icon="grid-outline" label="Section" value={item.preferredSection ?? '—'} />
              </View>

              <Text style={{ marginTop: 12 }} tone="subtle" variant="caption">
                Applied {formatDate(item.createdAt)}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    accessibilityHint={`Marks ${item.name}'s application as reviewed`}
                    accessibilityLabel={`Mark ${item.name} as reviewed`}
                    label="Mark reviewed"
                    loading={pendingReviewId === item.id}
                    onPress={() => reviewMutation.mutate(item.id)}
                    size="sm"
                    variant="secondary"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    accessibilityHint={`Opens the account form for ${item.name}`}
                    accessibilityLabel={`Create account for ${item.name}`}
                    label="Create account"
                    onPress={() => openCreate(item)}
                    size="sm"
                  />
                </View>
              </View>
            </Card>
          )}
          showsVerticalScrollIndicator={false}
        />
      </Screen>

      <Sheet
        footer={
          <Button
            disabled={!canCreate}
            icon="person-add-outline"
            label="Create student account"
            loading={createMutation.isPending}
            onPress={() => createMutation.mutate()}
          />
        }
        onClose={() => setSelected(null)}
        subtitle={selected ? `${selected.name} · ${selected.email}` : undefined}
        title="Create account"
        visible={Boolean(selected)}
      >
        <Input
          autoCapitalize="characters"
          autoCorrect={false}
          hint="This becomes the student's roll number."
          icon="id-card-outline"
          label="Student ID"
          onChangeText={(studentId) => setForm((current) => ({ ...current, studentId }))}
          placeholder="e.g. CS2026001"
          required
          value={form.studentId}
        />

        <Input
          icon="business-outline"
          label="Department"
          onChangeText={(department) => setForm((current) => ({ ...current, department }))}
          placeholder="Department"
          value={form.department}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Input
              icon="layers-outline"
              keyboardType="number-pad"
              label="Semester"
              onChangeText={(semester) =>
                setForm((current) => ({ ...current, semester: semester.replace(/[^0-9]/g, '') }))
              }
              placeholder="1"
              required
              value={form.semester}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              autoCapitalize="characters"
              icon="grid-outline"
              label="Section"
              onChangeText={(section) => setForm((current) => ({ ...current, section }))}
              placeholder="A"
              value={form.section}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}
