import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  InlineNotice,
  Input,
  ProgressBar,
  Screen,
  Select,
  SkeletonList,
  Text,
} from '@/src/components/ui';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { MAX_FONT_SCALE, radius } from '@/src/theme/tokens';
import type { GenerateQrResponse } from '@/src/types/instructorOps';
import type { Subject, SubjectsResponse } from '@/src/types/subject';

const DEFAULT_VALID_MINUTES = 5;
const MAX_VALID_MINUTES = 60;

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const getSubjects = async (): Promise<Subject[]> => {
  const response = await api.get<Subject[] | SubjectsResponse>('/subjects');
  return Array.isArray(response.data) ? response.data : response.data.subjects;
};

const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function InstructorQrScreen() {
  const { colors } = useTheme();
  const { subjectId } = useLocalSearchParams<{ subjectId?: string }>();

  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [date, setDate] = useState(getTodayInputValue);
  const [validMinutes, setValidMinutes] = useState(String(DEFAULT_VALID_MINUTES));
  const [generatedQr, setGeneratedQr] = useState<GenerateQrResponse | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generateRef = useRef<(() => void) | null>(null);

  const clearAutoRefresh = useCallback(() => {
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
  }, []);

  const resetAutoRefresh = useCallback(
    (delayMs: number) => {
      clearAutoRefresh();
      autoRefreshIntervalRef.current = setInterval(() => generateRef.current?.(), delayMs);
    },
    [clearAutoRefresh],
  );

  const subjectsQuery = useQuery({ queryKey: ['subjects', 'instructor'], queryFn: getSubjects });

  // Same hand-off as the attendance screen: a subjectId from the dashboard
  // preselects that class.
  useEffect(() => {
    if (selectedSubject || !subjectsQuery.data?.length) {
      return;
    }

    const requested = typeof subjectId === 'string' ? subjectId : undefined;
    setSelectedSubject(
      subjectsQuery.data.find((subject) => subject.id === requested) ?? subjectsQuery.data[0],
    );
  }, [selectedSubject, subjectId, subjectsQuery.data]);

  const parsedValidMinutes = useMemo(() => {
    const parsed = Number.parseInt(validMinutes, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return DEFAULT_VALID_MINUTES;
    }

    return Math.min(parsed, MAX_VALID_MINUTES);
  }, [validMinutes]);

  const isDateValid = isValidDate(date);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubject) {
        throw new Error('Select a subject first.');
      }

      const response = await api.post<GenerateQrResponse>('/attendance/generate-qr', {
        subjectId: selectedSubject.id,
        date,
        validMinutes: parsedValidMinutes,
      });

      return response.data;
    },
    onSuccess: (data) => {
      setGeneratedQr(data);
      setExpiresAt(Date.now() + parsedValidMinutes * 60 * 1000);
      setSecondsRemaining(parsedValidMinutes * 60);
      resetAutoRefresh(parsedValidMinutes * 60 * 1000);
    },
  });

  useEffect(() => {
    generateRef.current = generateMutation.mutate;
  }, [generateMutation.mutate]);

  useEffect(() => () => clearAutoRefresh(), [clearAutoRefresh]);

  useEffect(() => {
    clearAutoRefresh();
    setGeneratedQr(null);
    setExpiresAt(null);
    setSecondsRemaining(0);
  }, [clearAutoRefresh, selectedSubject?.id]);

  useEffect(() => {
    if (!expiresAt) {
      return undefined;
    }

    const interval = setInterval(() => {
      setSecondsRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const onRefresh = useCallback(async () => {
    await subjectsQuery.refetch();
    if (selectedSubject) {
      await generateMutation.mutateAsync();
    }
  }, [generateMutation, selectedSubject, subjectsQuery]);

  const canGenerate = Boolean(selectedSubject) && isDateValid;
  const totalSeconds = parsedValidMinutes * 60;
  const isExpired = Boolean(generatedQr) && secondsRemaining === 0;

  if (subjectsQuery.isLoading) {
    return (
      <Screen header={{ title: 'Class QR', subtitle: 'Generate a scannable attendance code.', showBack: false }}>
        <SkeletonList count={3} />
      </Screen>
    );
  }

  if (subjectsQuery.isError) {
    return (
      <Screen header={{ title: 'Class QR', showBack: false }}>
        <ErrorState onRetry={() => void subjectsQuery.refetch()} title="Could not load your subjects" />
      </Screen>
    );
  }

  return (
    <Screen
      header={{ title: 'Class QR', subtitle: 'Generate a scannable attendance code.', showBack: false }}
      onRefresh={onRefresh}
    >
      <View style={{ gap: 12 }}>
        <Select
          icon="book-outline"
          label="Subject"
          onChange={(id) =>
            setSelectedSubject(subjectsQuery.data?.find((subject) => subject.id === id) ?? null)
          }
          options={(subjectsQuery.data ?? []).map((subject) => ({
            value: subject.id,
            label: subject.name,
            description: `${subject.code} · Semester ${subject.semester}`,
          }))}
          placeholder="Select a subject"
          value={selectedSubject?.id ?? null}
        />

        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Input
              autoCapitalize="none"
              error={isDateValid ? undefined : 'Use the format YYYY-MM-DD.'}
              icon="calendar-outline"
              keyboardType="numbers-and-punctuation"
              label="Date"
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              value={date}
            />
          </View>

          <View
            style={{
              width: 108,
              marginTop: 22,
              justifyContent: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text tone="subtle" uppercase variant="label">
              Minutes
            </Text>
            <TextInput
              accessibilityHint={`How long the code stays valid, up to ${MAX_VALID_MINUTES} minutes`}
              accessibilityLabel="Minutes the QR code stays valid"
              keyboardType="number-pad"
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              onChangeText={(value) => setValidMinutes(value.replace(/[^0-9]/g, ''))}
              style={{ marginTop: 2, fontSize: 15, fontWeight: '600', color: colors.text, paddingVertical: 4 }}
              value={validMinutes}
            />
          </View>
        </View>

        <Button
          accessibilityHint="Creates a QR code students can scan to mark attendance"
          disabled={!canGenerate}
          icon="qr-code-outline"
          label="Generate QR code"
          loading={generateMutation.isPending}
          onPress={() => generateMutation.mutate()}
          size="lg"
        />

        {generateMutation.isError ? (
          <InlineNotice
            description="Check the selected subject and date, then try again."
            title="Could not generate the QR code"
            tone="danger"
          />
        ) : null}
      </View>

      <Card padding="lg" style={{ marginTop: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text tone="muted" variant="caption">
              {isExpired ? 'Expired' : 'Expires in'}
            </Text>
            <Text
              accessibilityLabel={
                generatedQr
                  ? isExpired
                    ? 'This code has expired'
                    : `Expires in ${formatCountdown(secondsRemaining)}`
                  : 'No code generated yet'
              }
              accessibilityLiveRegion="polite"
              style={{ marginTop: 4, color: isExpired ? colors.danger : undefined }}
              tone={isExpired ? 'inherit' : 'default'}
              variant="display"
            >
              {generatedQr ? formatCountdown(secondsRemaining) : '––:––'}
            </Text>
          </View>

          <Button
            accessibilityLabel="Regenerate the QR code"
            disabled={!canGenerate}
            fullWidth={false}
            icon="refresh"
            label="Regenerate"
            loading={generateMutation.isPending}
            onPress={() => generateMutation.mutate()}
            size="sm"
            variant="secondary"
          />
        </View>

        {generatedQr ? (
          <ProgressBar
            color={isExpired ? colors.danger : colors.primaryText}
            label="Time remaining on this code"
            style={{ marginTop: 14 }}
            value={totalSeconds === 0 ? 0 : (secondsRemaining / totalSeconds) * 100}
          />
        ) : null}

        {generatedQr?.qrCode ? (
          <Image
            accessibilityLabel="Class attendance QR code"
            resizeMode="contain"
            source={{ uri: generatedQr.qrCode }}
            style={{
              width: '100%',
              aspectRatio: 1,
              marginTop: 20,
              borderRadius: radius.md,
              // A white quiet zone keeps the code scannable in dark mode.
              backgroundColor: '#FFFFFF',
              opacity: isExpired ? 0.35 : 1,
            }}
          />
        ) : (
          <View
            style={{
              width: '100%',
              aspectRatio: 1,
              marginTop: 20,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Text center tone="muted" variant="caption">
              Your QR code will appear here.
            </Text>
          </View>
        )}

        <Text center style={{ marginTop: 14 }} tone="subtle" variant="caption">
          Students scan this from the Scanner screen. A new code is generated automatically when this
          one expires.
        </Text>
      </Card>
    </Screen>
  );
}
