import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/services/api';
import type { AttendanceSummaryResponse } from '@/src/types/attendance';

export const useAttendance = () => {
  const { isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['attendance', 'my'],
    queryFn: async () => {
      const response = await api.get<AttendanceSummaryResponse>('/attendance/my');
      return response.data;
    },
    enabled: isAuthenticated,
  });

  return {
    summary: query.data?.summary ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};
