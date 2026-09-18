import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import useLiveNotifications from '../src/hooks/useLiveNotifications'

const { handlers, socket, refreshSession } = vi.hoisted(() => {
  const handlers = {}
  return {
    handlers,
    socket: { on: vi.fn((event, fn) => { handlers[event] = fn }), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn() },
    refreshSession: vi.fn()
  }
})
vi.mock('socket.io-client', () => ({ io: () => socket }))
vi.mock('../src/utils/api', () => ({ API_ORIGIN: 'http://localhost', refreshSession }))

describe('live notification session renewal', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('refreshes the cookie session and reconnects after server expiration', async () => {
    refreshSession.mockResolvedValue({})
    const onNotification = vi.fn()
    const { unmount } = renderHook(() => useLiveNotifications({ enabled: true, onNotification }))
    await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1))
    await act(async () => { handlers.disconnect('io server disconnect') })
    await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(2))
    handlers['notification:new']({ notification: { id: 'fresh' } })
    expect(onNotification).toHaveBeenCalledWith({ notification: { id: 'fresh' } })
    unmount()
  })

  it('does not reconnect after failed refresh or unmount while refresh is pending', async () => {
    refreshSession.mockRejectedValueOnce(new Error('revoked'))
    const { unmount } = renderHook(() => useLiveNotifications({ enabled: true }))
    await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1))
    await act(async () => { handlers.disconnect('io server disconnect') })
    expect(socket.connect).toHaveBeenCalledTimes(1)
    let complete
    refreshSession.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    act(() => { handlers.disconnect('io server disconnect') })
    unmount()
    await act(async () => { complete({}) })
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })
})
