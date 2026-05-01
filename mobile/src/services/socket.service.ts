import { io, type Socket } from 'socket.io-client';

import { SOCKET_URL } from '@/src/constants/config';

let socket: Socket | null = null;

type AuthRefreshAck = {
  ok?: boolean;
};

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

export const updateSocketToken = (newToken: string): void => {
  if (!socket) {
    return;
  }

  socket.auth = { token: newToken };

  if (socket.connected) {
    socket.emit('auth:refresh', { token: newToken }, (ack?: AuthRefreshAck) => {
      if (ack?.ok === false) {
        socket?.disconnect();
      }
    });
  }
};

export const getSocket = (): Socket | null => socket;
