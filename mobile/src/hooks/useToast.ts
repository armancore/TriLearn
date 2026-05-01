import { useCallback } from 'react';
import axios from 'axios';
import Toast from 'react-native-toast-message';

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
  const showSuccess = useCallback((message: string) => {
    Toast.show({
      type: 'success',
      text1: message,
      visibilityTime: 3000,
      autoHide: true,
    });
  }, []);

  const showError = useCallback((message: string) => {
    Toast.show({
      type: 'error',
      text1: message,
      visibilityTime: 3000,
      autoHide: true,
    });
  }, []);

  const showInfo = useCallback((message: string) => {
    Toast.show({
      type: 'info',
      text1: message,
      visibilityTime: 3000,
      autoHide: true,
    });
  }, []);

  const success = useCallback((message: string) => {
    showSuccess(message);
  }, [showSuccess]);

  const error = useCallback((errorValue: unknown, fallback = 'Something went wrong.') => {
    showError(getErrorMessage(errorValue, fallback));
  }, [showError]);

  return { showSuccess, showError, showInfo, success, error };
};
