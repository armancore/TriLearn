import { ROLES } from '../constants/roles'

export const getHomeRouteForRole = (role) => {
  switch (role) {
    case ROLES.STUDENT:
      return '/student'
    case ROLES.INSTRUCTOR:
      return '/instructor'
    case ROLES.GATEKEEPER:
      return '/gatekeeper'
    case ROLES.ADMIN:
    case ROLES.COORDINATOR:
      return '/admin'
    default:
      return '/auth/login'
  }
}
