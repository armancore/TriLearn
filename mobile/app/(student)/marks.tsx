import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Card,
  EmptyState,
  FilterChips,
  Screen,
  SkeletonCard,
  SkeletonList,
  StatTile,
  Text,
} from '@/src/components/ui';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ExamType, MarksResponse, MarksSummaryResponse } from '@/src/types/marks';

const EXAM_TYPES: ExamType[] = ['INTERNAL', 'MIDTERM', 'FINAL', 'PRACTICAL'];

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Not published';
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
};

/** Grades map to a tone so a good result reads as good at a glance. */
const gradeTone = (grade: string) => {
  const head = grade.trim().charAt(0).toUpperCase();
  if (head === 'A') return 'success' as const;
  if (head === 'B' || head === 'C') return 'info' as const;
  if (head === 'D') return 'warning' as const;
  return 'danger' as const;
};

export default function StudentMarksScreen() {
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const [activeExamType, setActiveExamType] = useState<ExamType>('INTERNAL');

  const marksQuery = useQuery({
    queryKey: ['marks', 'my', activeExamType],
    queryFn: async () =>
      (await api.get<MarksResponse>(`/marks/my?examType=${activeExamType}&page=1&limit=50`)).data,
    enabled: isAuthenticated,
  });

  const summaryQuery = useQuery({
    queryKey: ['marks', 'my', 'summary'],
    queryFn: async () => (await api.get<MarksSummaryResponse>('/marks/my/summary')).data,
    enabled: isAuthenticated,
  });

  const publishedMarks = useMemo(
    () =>
      (marksQuery.data?.marks ?? []).filter(
        (mark) => mark.isPublished && mark.examType === activeExamType,
      ),
    [activeExamType, marksQuery.data?.marks],
  );

  const availableExamTypes = useMemo(() => {
    const available = new Set<ExamType>([
      ...EXAM_TYPES,
      ...(marksQuery.data?.availableExamTypes ?? []),
      ...(summaryQuery.data?.availableExamTypes ?? []),
    ]);

    return EXAM_TYPES.filter((type) => available.has(type));
  }, [marksQuery.data?.availableExamTypes, summaryQuery.data?.availableExamTypes]);

  const summary = summaryQuery.data?.resultSheet;

  const onRefresh = useCallback(
    async () => Promise.all([marksQuery.refetch(), summaryQuery.refetch()]),
    [marksQuery, summaryQuery],
  );

  return (
    <Screen
      header={{ title: 'Marks', subtitle: 'Published results grouped by exam type.', showBack: false }}
      onRefresh={onRefresh}
    >
      {summaryQuery.isLoading ? (
        <SkeletonCard lines={1} showFooter />
      ) : (
        <Card padding="lg" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <Text style={{ color: 'rgba(255,255,255,0.82)' }} tone="inherit" variant="caption">
            Semester summary
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
            <View>
              <Text style={{ color: '#FFFFFF' }} tone="inherit" variant="display">
                {summary?.overallGpa?.toFixed(2) ?? '0.00'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.82)', marginTop: 2 }} tone="inherit" variant="caption">
                Overall GPA
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: '#FFFFFF' }} tone="inherit" variant="title">
                {summary?.overallPercentage ?? 0}%
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.82)', marginTop: 2 }} tone="inherit" variant="caption">
                Overall score
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <StatTile
              label="Marks"
              onPrimary
              value={`${summary?.totals.obtainedMarks ?? 0}/${summary?.totals.totalMarks ?? 0}`}
            />
            <StatTile label="Subjects" onPrimary value={summary?.subjects.length ?? 0} />
            <StatTile label="Grade" onPrimary value={summary?.overallGrade ?? '—'} />
          </View>
        </Card>
      )}

      <View style={{ marginTop: 20 }}>
        <FilterChips
          label="Exam type"
          onChange={setActiveExamType}
          options={availableExamTypes}
          value={activeExamType}
        />
      </View>

      <View style={{ gap: 14, marginTop: 18 }}>
        {marksQuery.isLoading ? (
          <SkeletonList count={3} showFooter />
        ) : publishedMarks.length === 0 ? (
          <EmptyState
            description={`Published ${activeExamType.toLowerCase()} results will appear here once your instructor releases them.`}
            icon="ribbon-outline"
            title="No marks published yet"
          />
        ) : (
          publishedMarks.map((mark) => (
            <Card key={mark.id} padding="lg">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} variant="subheading">
                    {mark.subject?.name ?? 'Subject'}
                  </Text>
                  <Text style={{ marginTop: 3 }} tone="muted" variant="caption">
                    {mark.subject?.code ?? 'N/A'} · {mark.examType}
                  </Text>
                </View>
                <Badge
                  accessibilityLabel={`Grade ${mark.grade}`}
                  label={mark.grade}
                  tone={gradeTone(mark.grade)}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <StatTile label="Marks" value={`${mark.obtainedMarks}/${mark.totalMarks}`} />
                <StatTile label="Percentage" value={`${Math.round(mark.percentage)}%`} />
                <StatTile label="Grade point" value={mark.gradePoint.toFixed(1)} />
              </View>

              {mark.remarks ? (
                <Text style={{ marginTop: 14 }} tone="muted" variant="caption">
                  {mark.remarks}
                </Text>
              ) : null}

              <Text style={{ marginTop: 10 }} tone="subtle" variant="caption">
                Published {formatDate(mark.publishedAt)}
              </Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
