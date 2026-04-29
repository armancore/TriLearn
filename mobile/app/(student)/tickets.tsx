import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/src/constants/colors';
import { api } from '@/src/services/api';
import type { MyAbsenceTicketsResponse, TicketAttendance, AbsenceTicketStatus } from '@/src/types/ticket';

const statusTone: Record<AbsenceTicketStatus, { bg: string; text: string }> = {
  PENDING: { bg: '#FEF3C7', text: '#92400E' },
  APPROVED: { bg: '#DCFCE7', text: '#166534' },
  REJECTED: { bg: '#FEE2E2', text: '#B91C1C' },
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export default function StudentTicketsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<TicketAttendance | null>(null);
  const [reason, setReason] = useState('');

  const query = useQuery({
    queryKey: ['attendance', 'tickets', 'my'],
    queryFn: async () => (await api.get<MyAbsenceTicketsResponse>('/attendance/tickets/my')).data,
  });

  const absences = useMemo(() => query.data?.absencesWithoutTicket ?? [], [query.data?.absencesWithoutTicket]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAttendance) throw new Error('Select an absence first');
      await api.post('/attendance/tickets', { attendanceId: selectedAttendance.id, reason });
    },
    onSuccess: async () => {
      setModalOpen(false);
      setSelectedAttendance(null);
      setReason('');
      await query.refetch();
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

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 24, paddingBottom: 96 }}
        data={query.data?.tickets ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text className="text-2xl font-bold text-primary">Absence Tickets</Text>
            <Text className="mt-2 text-sm text-slate-600">Submit and track absence review requests.</Text>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View className="h-24 rounded-2xl bg-white" />
          ) : (
            <Text className="rounded-2xl bg-white p-5 text-center text-slate-500">No absence tickets</Text>
          )
        }
        refreshControl={<RefreshControl colors={[COLORS.primary]} refreshing={refreshing} tintColor={COLORS.primary} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const tone = statusTone[item.status];
          return (
            <View className="rounded-2xl bg-white p-5">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-slate-900">{item.attendance.subject.name}</Text>
                  <Text className="mt-1 text-sm font-semibold text-primary">{item.attendance.subject.code}</Text>
                </View>
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: tone.bg }}>
                  <Text className="text-xs font-bold" style={{ color: tone.text }}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <Text className="mt-3 text-sm text-slate-500">Absent on {formatDate(item.attendance.date)}</Text>
              <Text className="mt-3 text-sm leading-6 text-slate-600" numberOfLines={2}>{item.reason}</Text>
              {item.response ? (
                <View className="mt-4 rounded-xl bg-slate-100 p-3">
                  <Text className="text-xs font-medium text-slate-500">Instructor response</Text>
                  <Text className="mt-1 text-sm text-slate-700">{item.response}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      <Pressable className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary" onPress={() => setModalOpen(true)}>
        <Text className="text-3xl font-light text-white">+</Text>
      </Pressable>

      <Modal animationType="slide" transparent visible={modalOpen} onRequestClose={() => setModalOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setModalOpen(false)}>
          <Pressable className="max-h-[82%] rounded-t-3xl bg-white p-6" onPress={(event) => event.stopPropagation()}>
            <View className="h-1 w-12 self-center rounded-full bg-slate-200" />
            <Text className="mt-6 text-xl font-bold text-slate-900">Submit absence ticket</Text>
            <Text className="mt-2 text-sm text-slate-500">Choose an absent record without an existing ticket.</Text>

            <FlatList
              className="mt-4 max-h-56"
              data={absences}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text className="rounded-xl bg-slate-100 p-4 text-center text-sm text-slate-500">No eligible absent records</Text>}
              renderItem={({ item }) => {
                const active = selectedAttendance?.id === item.id;
                return (
                  <Pressable
                    className={`mb-2 rounded-xl p-4 ${active ? 'bg-primary' : 'bg-slate-100'}`}
                    onPress={() => setSelectedAttendance(item)}
                  >
                    <Text className={`font-bold ${active ? 'text-white' : 'text-slate-900'}`}>{item.subject.name}</Text>
                    <Text className={`mt-1 text-sm ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                      {item.subject.code} • {formatDate(item.date)}
                    </Text>
                  </Pressable>
                );
              }}
            />

            <TextInput
              className="mt-4 min-h-28 rounded-xl bg-slate-100 px-4 py-3 text-slate-900"
              multiline
              placeholder="Reason"
              placeholderTextColor="#94A3B8"
              textAlignVertical="top"
              value={reason}
              onChangeText={setReason}
            />
            <Pressable
              className={`mt-5 rounded-xl px-5 py-4 ${selectedAttendance && reason.trim().length >= 5 ? 'bg-primary' : 'bg-slate-300'}`}
              disabled={!selectedAttendance || reason.trim().length < 5 || submitMutation.isPending}
              onPress={() => submitMutation.mutate()}
            >
              <Text className="text-center font-bold text-white">{submitMutation.isPending ? 'Submitting...' : 'Submit ticket'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
