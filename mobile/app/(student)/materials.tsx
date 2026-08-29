import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  SCREEN_GUTTER,
  Screen,
  SkeletonList,
  Text,
} from '@/src/components/ui';
import { useToast } from '@/src/hooks/useToast';
import { api } from '@/src/services/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';
import type { StudyMaterial, StudyMaterialsResponse } from '@/src/types/material';
import { openAuthenticatedUpload } from '@/src/utils/uploadFiles';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

export default function StudentMaterialsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [selectedSubjectId, setSelectedSubjectId] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['materials', 'student'],
    queryFn: async () => (await api.get<StudyMaterialsResponse>('/materials?page=1&limit=100')).data,
  });

  /** Chip values are subject ids; the map keeps a readable label for each. */
  const subjectLabels = useMemo(() => {
    const labels = new Map<string, string>([['ALL', 'All subjects']]);
    for (const material of query.data?.materials ?? []) {
      labels.set(material.subjectId, material.subject?.code ?? 'Subject');
    }
    return labels;
  }, [query.data?.materials]);

  const subjectIds = useMemo(() => Array.from(subjectLabels.keys()), [subjectLabels]);

  const materials = useMemo(
    () =>
      (query.data?.materials ?? []).filter(
        (material) => selectedSubjectId === 'ALL' || material.subjectId === selectedSubjectId,
      ),
    [query.data?.materials, selectedSubjectId],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const openMaterial = async (material: StudyMaterial) => {
    setOpeningId(material.id);
    try {
      await openAuthenticatedUpload(material.fileUrl);
    } catch (error) {
      toast.error(error, 'Could not open this material.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Screen
      header={{ title: 'Materials', subtitle: 'Course files shared by your instructors.' }}
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
        data={materials}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonList count={3} />
          ) : query.isError ? (
            <ErrorState onRetry={() => void query.refetch()} title="Could not load materials" />
          ) : (
            <EmptyState
              description="Files your instructors upload will appear here."
              icon="folder-open-outline"
              title="No study materials yet"
            />
          )
        }
        ListHeaderComponent={
          subjectIds.length > 1 ? (
            <View style={{ paddingBottom: 4 }}>
              <FilterChips
                formatLabel={(id) => subjectLabels.get(id) ?? 'Subject'}
                label="Filter by subject"
                onChange={setSelectedSubjectId}
                options={subjectIds}
                value={selectedSubjectId}
              />
            </View>
          ) : null
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
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Ionicons color={colors.primarySoftText} name="document-text-outline" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} variant="subheading">
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 3 }} tone="muted" variant="caption">
                  {item.subject?.name ?? 'Subject'}
                  {item.subject?.code ? ` · ${item.subject.code}` : ''}
                </Text>
              </View>
            </View>

            {item.description ? (
              <Text numberOfLines={3} style={{ marginTop: 12 }} tone="muted" variant="caption">
                {item.description}
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 16,
              }}
            >
              <Text style={{ flex: 1 }} tone="subtle" variant="caption">
                Uploaded {formatDate(item.createdAt)}
              </Text>
              <Button
                accessibilityHint={`Opens ${item.title}`}
                accessibilityLabel={`Open ${item.title}`}
                fullWidth={false}
                icon="open-outline"
                label="Open"
                loading={openingId === item.id}
                onPress={() => void openMaterial(item)}
                size="sm"
                variant="tonal"
              />
            </View>
          </Card>
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
