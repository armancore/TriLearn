import { io, type Socket } from 'socket.io-client';

import { SOCKET_URL } from '@/src/constants/config';

let socket: Socket | null = null;

export const connectSocket = (token: string, userId: string): Socket => {
  if (socket?.connected) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
    query: { userId },
  });

  return socket;
};

export const disconnectSocket = (): void => {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
};

export const getSocket = (): Socket | null => socket;
