import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  SCREEN_GUTTER,
  Screen,
  Select,
  Sheet,
  SkeletonList,
  Text,
  type BadgeTone,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { Notice, NoticeAudience, NoticesResponse, NoticeType } from '@/src/types/notice';

const TYPE_OPTIONS: { value: NoticeType; label: string; description: string }[] = [
  { value: 'GENERAL', label: 'General', description: 'Everyday information' },
  { value: 'EXAM', label: 'Exam', description: 'Exam schedules and rules' },
  { value: 'HOLIDAY', label: 'Holiday', description: 'Closures and breaks' },
  { value: 'EVENT', label: 'Event', description: 'Campus events and activities' },
  { value: 'URGENT', label: 'Urgent', description: 'Time-critical announcements' },
];

const AUDIENCE_OPTIONS: { value: NoticeAudience; label: string; description: string }[] = [
  { value: 'ALL', label: 'Everyone', description: 'Students and instructors' },
  { value: 'STUDENTS', label: 'Students only', description: 'Visible to students' },
  { value: 'INSTRUCTORS_ONLY', label: 'Instructors only', description: 'Visible to teaching staff' },
];

const TYPE_TONE: Record<NoticeType, BadgeTone> = {
  GENERAL: 'neutral',
  EXAM: 'info',
  HOLIDAY: 'success',
  EVENT: 'accent',
  URGENT: 'danger',
};

const MIN_TITLE_LENGTH = 3;
const MIN_CONTENT_LENGTH = 10;

const emptyForm = {
  title: '',
  content: '',
  type: 'GENERAL' as NoticeType,
  audience: 'ALL' as NoticeAudience,
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export default function CoordinatorNoticesScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const query = useQuery({
    queryKey: ['notices', 'coordinator'],
    queryFn: async () => (await api.get<NoticesResponse>('/notices?page=1&limit=50')).data,
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post('/notices', form),
    onError: (error) => toast.error(error, 'Could not publish the notice.'),
    onSuccess: async () => {
      setIsComposerOpen(false);
      setForm(emptyForm);
      await query.refetch();
      toast.success('Notice published.');
      announce('Notice published');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const canPublish =
    form.title.trim().length >= MIN_TITLE_LENGTH && form.content.trim().length >= MIN_CONTENT_LENGTH;

  return (
    <>
      <Screen
        header={{
          title: 'Notices',
          subtitle: 'View and publish department announcements.',
          showBack: false,
          actions: (
            <IconButton
              accessibilityLabel="Write a new notice"
              icon="add"
              onPress={() => setIsComposerOpen(true)}
              variant="solid"
            />
          ),
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
          data={query.data?.notices ?? []}
          keyExtractor={(item: Notice) => item.id}
          ListEmptyComponent={
            query.isLoading ? (
              <SkeletonList count={3} />
            ) : query.isError ? (
              <ErrorState onRetry={() => void query.refetch()} title="Could not load notices" />
            ) : (
              <EmptyState
                actionLabel="Write a notice"
                description="Publish an announcement for your department."
                icon="megaphone-outline"
                onAction={() => setIsComposerOpen(true)}
                title="No notices yet"
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
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ flex: 1 }} variant="subheading">
                  {item.title}
                </Text>
                <Badge label={item.type} tone={TYPE_TONE[item.type] ?? 'neutral'} />
              </View>
              <Text style={{ marginTop: 6 }} tone="subtle" variant="caption">
                {formatDate(item.createdAt)} · {item.audience.replace('_', ' ').toLowerCase()}
              </Text>
              <Text numberOfLines={3} style={{ marginTop: 10 }} tone="muted" variant="caption">
                {item.content}
              </Text>
            </Card>
          )}
          showsVerticalScrollIndicator={false}
        />
      </Screen>

      <Sheet
        footer={
          <Button
            disabled={!canPublish}
            icon="send-outline"
            label="Publish notice"
            loading={createMutation.isPending}
            onPress={() => createMutation.mutate()}
          />
        }
        onClose={() => setIsComposerOpen(false)}
        subtitle="Everyone in the selected audience is notified."
        title="New notice"
        visible={isComposerOpen}
      >
        <Input
          label="Title"
          onChangeText={(title) => setForm((current) => ({ ...current, title }))}
          placeholder="What is this about?"
          required
          value={form.title}
        />

        <Input
          hint={`At least ${MIN_CONTENT_LENGTH} characters.`}
          label="Content"
          multiline
          onChangeText={(content) => setForm((current) => ({ ...current, content }))}
          placeholder="Write the announcement…"
          required
          value={form.content}
        />

        <View style={{ gap: 12 }}>
          <Select
            icon="pricetag-outline"
            label="Type"
            onChange={(type) => setForm((current) => ({ ...current, type }))}
            options={TYPE_OPTIONS}
            value={form.type}
          />
          <Select
            icon="people-outline"
            label="Audience"
            onChange={(audience) => setForm((current) => ({ ...current, audience }))}
            options={AUDIENCE_OPTIONS}
            value={form.audience}
          />
        </View>
      </Sheet>
    </>
  );
}
