import { useCallback } from 'react';
import { Alert } from 'react-native';
import axios from 'axios';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export const useToast = () => {
  const success = useCallback((message: string, title = 'Success') => {
    Alert.alert(title, message);
  }, []);

  const error = useCallback((errorValue: unknown, fallback = 'Something went wrong.') => {
    Alert.alert('Unable to complete action', getErrorMessage(errorValue, fallback));
  }, []);

  return { success, error };
};

