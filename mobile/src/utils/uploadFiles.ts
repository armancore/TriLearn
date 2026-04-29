import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { BACKEND_ORIGIN } from '@/src/constants/config';
import { useAuthStore } from '@/src/store/auth.store';

const getUploadUrl = (fileUrl: string) => {
  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  const normalizedPath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  return `${BACKEND_ORIGIN}${normalizedPath}`;
};

const getSafeFileName = (fileUrl: string) => {
  const pathPart = fileUrl.split('?')[0] ?? '';
  const name = pathPart.split('/').filter(Boolean).pop() || 'trilearn-file.pdf';
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
};

export const openAuthenticatedUpload = async (fileUrl: string) => {
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw new Error('Please log in again to open this file.');
  }

  const targetUrl = getUploadUrl(fileUrl);
  const localUri = `${FileSystem.cacheDirectory}${getSafeFileName(fileUrl)}`;
  const result = await FileSystem.downloadAsync(targetUrl, localUri, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Could not download file. Server returned ${result.status}.`);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Open file',
    });
    return;
  }

  throw new Error('No file viewer is available on this device.');
};
