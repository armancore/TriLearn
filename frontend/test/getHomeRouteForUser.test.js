import { describe, expect, it } from 'vitest'
import { getHomeRouteForUser } from '../src/utils/auth'

describe('getHomeRouteForUser', () => {
  it('routes unauthenticated users to login', () => {
    expect(getHomeRouteForUser(null)).toBe('/login')
  })

  it('prioritizes forced password changes', () => {
    expect(getHomeRouteForUser({ role: 'ADMIN', mustChangePassword: true })).toBe('/change-password')
  })

  it('sends incomplete students to profile completion', () => {
    expect(getHomeRouteForUser({ role: 'STUDENT', profileCompleted: false })).toBe('/student/profile')
  })

  it('maps supported roles to their home routes', () => {
    expect(getHomeRouteForUser({ role: 'ADMIN' })).toBe('/admin')
    expect(getHomeRouteForUser({ role: 'COORDINATOR' })).toBe('/coordinator')
    expect(getHomeRouteForUser({ role: 'GATEKEEPER' })).toBe('/gate')
    expect(getHomeRouteForUser({ role: 'INSTRUCTOR' })).toBe('/instructor')
    expect(getHomeRouteForUser({ role: 'STUDENT', profileCompleted: true })).toBe('/student')
  })
})
