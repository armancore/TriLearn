import { describe, expect, it, vi } from 'vitest'

import logger from '../src/utils/logger'

describe('logger sanitization', () => {
  it('sanitizes axios-like errors before logging', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error({
      message: 'Network Error',
      config: {
        url: '/auth/me',
        method: 'get',
        headers: { Authorization: 'Bearer secret-token' },
        data: { password: 'hidden' }
      },
      response: {
        status: 401
      }
    })

    expect(errorSpy).toHaveBeenCalledWith({
      message: 'Network Error',
      status: 401,
      url: '/auth/me',
      method: 'get'
    })
    expect(String(errorSpy.mock.calls[0][0])).not.toContain('secret-token')
    expect(String(errorSpy.mock.calls[0][0])).not.toContain('hidden')
  })
})
