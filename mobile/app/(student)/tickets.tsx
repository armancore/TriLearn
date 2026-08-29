import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

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
  Sheet,
  SkeletonList,
  Text,
  type BadgeTone,
} from '@/src/components/ui';
import { announce } from '@/src/hooks/useA11y';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { AbsenceTicketStatus, MyAbsenceTicketsResponse, TicketAttendance } from '@/src/types/ticket';

const STATUS: Record<AbsenceTicketStatus, { tone: BadgeTone; icon: 'time-outline' | 'checkmark-circle' | 'close-circle' }> = {
  PENDING: { tone: 'warning', icon: 'time-outline' },
  APPROVED: { tone: 'success', icon: 'checkmark-circle' },
  REJECTED: { tone: 'danger', icon: 'close-circle' },
};

const MIN_REASON_LENGTH = 5;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export default function StudentTicketsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<TicketAttendance | null>(null);
  const [reason, setReason] = useState('');

  const query = useQuery({
    queryKey: ['attendance', 'tickets', 'my'],
    queryFn: async () => (await api.get<MyAbsenceTicketsResponse>('/attendance/tickets/my')).data,
  });

  const absences = useMemo(
    () => query.data?.absencesWithoutTicket ?? [],
    [query.data?.absencesWithoutTicket],
  );

  const closeComposer = useCallback(() => {
    setIsComposerOpen(false);
    setSelectedAttendance(null);
    setReason('');
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAttendance) {
        throw new Error('Select an absence first.');
      }

      await api.post('/attendance/tickets', { attendanceId: selectedAttendance.id, reason });
    },
    onSuccess: async () => {
      closeComposer();
      await query.refetch();
      toast.success('Absence ticket submitted.');
      announce('Absence ticket submitted');
    },
    onError: (error) => toast.error(error, 'Could not submit the absence ticket.'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const canSubmit = Boolean(selectedAttendance) && reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <>
      <Screen
        header={{
          title: 'Absence tickets',
          subtitle: 'Explain an absence and track the review.',
          actions: (
            <IconButton
              accessibilityLabel="New absence ticket"
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
          data={query.data?.tickets ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            query.isLoading ? (
              <SkeletonList count={3} />
            ) : query.isError ? (
              <ErrorState onRetry={() => void query.refetch()} title="Could not load your tickets" />
            ) : (
              <EmptyState
                actionLabel="New ticket"
                description="Raise a ticket to explain an absence to your instructor."
                icon="ticket-outline"
                onAction={() => setIsComposerOpen(true)}
                title="No absence tickets"
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
          renderItem={({ item }) => {
            const status = STATUS[item.status];

            return (
              <Card padding="lg">
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} variant="subheading">
                      {item.attendance.subject.name}
                    </Text>
                    <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
                      {item.attendance.subject.code} · Absent on {formatDate(item.attendance.date)}
                    </Text>
                  </View>
                  <Badge icon={status.icon} label={item.status} tone={status.tone} />
                </View>

                <Text style={{ marginTop: 12 }} tone="muted" variant="caption">
                  {item.reason}
                </Text>

                {item.response ? (
                  <View
                    style={{
                      marginTop: 14,
                      padding: 12,
                      borderRadius: radius.md,
                      backgroundColor: colors.surfaceMuted,
                    }}
                  >
                    <Text tone="subtle" uppercase variant="label">
                      Instructor response
                    </Text>
                    <Text style={{ marginTop: 4 }} tone="muted" variant="caption">
                      {item.response}
                    </Text>
                  </View>
                ) : null}
              </Card>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </Screen>

      <Sheet
        footer={
          <Button
            disabled={!canSubmit}
            label="Submit ticket"
            loading={submitMutation.isPending}
            onPress={() => submitMutation.mutate()}
          />
        }
        onClose={closeComposer}
        subtitle="Pick an absence that does not have a ticket yet, then explain what happened."
        title="New absence ticket"
        visible={isComposerOpen}
      >
        <Text style={{ marginBottom: 10 }} tone="muted" uppercase variant="label">
          Absent record
        </Text>

        {absences.length === 0 ? (
          <View
            style={{
              padding: 16,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Text center tone="muted" variant="caption">
              You have no absences that still need a ticket.
            </Text>
          </View>
        ) : (
          <View accessibilityLabel="Absent records" accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {absences.map((absence) => {
              const isSelected = selectedAttendance?.id === absence.id;

              return (
                <Pressable
                  accessibilityLabel={`${absence.subject.name}, ${absence.subject.code}, ${formatDate(absence.date)}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected }}
                  key={absence.id}
                  onPress={() => setSelectedAttendance(absence)}
                  style={({ pressed }) => ({
                    minHeight: 56,
                    justifyContent: 'center',
                    padding: 14,
                    borderRadius: radius.md,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? colors.primaryText : colors.border,
                    backgroundColor: isSelected ? colors.primarySoft : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text variant="bodyStrong">{absence.subject.name}</Text>
                  <Text style={{ marginTop: 2 }} tone="muted" variant="caption">
                    {absence.subject.code} · {formatDate(absence.date)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <Input
            hint={`At least ${MIN_REASON_LENGTH} characters. Your instructor reads this.`}
            label="Reason for absence"
            multiline
            onChangeText={setReason}
            placeholder="Explain why you could not attend…"
            required
            value={reason}
          />
        </View>
      </Sheet>
    </>
  );
}
