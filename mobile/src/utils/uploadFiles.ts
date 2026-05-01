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

export const getMimeType = (filename: string): string => {
  const extension = filename.split('?')[0]?.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    zip: 'application/zip',
    txt: 'text/plain',
  };

  return extension ? mimeTypes[extension] ?? 'application/octet-stream' : 'application/octet-stream';
};

export const downloadFile = async (
  url: string,
  filename: string,
  accessToken: string
): Promise<void> => {
  if (!FileSystem.documentDirectory) {
    throw new Error('Secure document storage is not available on this device.');
  }

  const safeFilename = getSafeFileName(filename);
  const localUri = `${FileSystem.documentDirectory}${Date.now()}_${safeFilename}`;

  try {
    const result = await FileSystem.downloadAsync(url, localUri, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Could not download file. Server returned ${result.status}.`);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, {
        mimeType: getMimeType(safeFilename),
        dialogTitle: 'Open file',
      });
      return;
    }

    throw new Error('No file viewer is available on this device.');
  } finally {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  }
};

export const openAuthenticatedUpload = async (fileUrl: string) => {
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw new Error('Please log in again to open this file.');
  }

  const targetUrl = getUploadUrl(fileUrl);
  await downloadFile(targetUrl, getSafeFileName(fileUrl), accessToken);
};
