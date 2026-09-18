import { refreshAccessToken } from '@/src/services/auth.service';
const mockPost = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { create: () => ({ post: (...args: unknown[]) => mockPost(...args), interceptors: { request: { use: jest.fn() } } }) } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
it('shares a refresh request between startup and screen requests, then permits the next rotation', async () => {
  let resolve!: (value: {data: {accessToken: string, refreshToken: string}}) => void;
  mockPost.mockReturnValue(new Promise(done => { resolve = done; }));
  const startup = refreshAccessToken('saved');
  const screen = refreshAccessToken('saved');
  expect(mockPost).toHaveBeenCalledTimes(1);
  resolve({ data: { accessToken: 'access', refreshToken: 'rotated' } });
  expect(await startup).toEqual(await screen);
  mockPost.mockResolvedValue({ data: { accessToken: 'next', refreshToken: 'next-refresh' } });
  await refreshAccessToken('rotated');
  expect(mockPost).toHaveBeenCalledTimes(2);
});
