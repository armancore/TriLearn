declare module 'cookie-parser'
declare module 'swagger-ui-express'
declare module 'jsonwebtoken'

declare namespace Express {
  namespace Multer { interface File { url?: string } }
  interface Request {
    id?: string
    logger?: import('winston').Logger
    user?: any
    student?: any
    instructor?: any
    coordinator?: any
    gatekeeper?: any
    mobileAppVersion?: string
    csrfToken?: string
    accessToken?: string
    accessTokenPayload?: { id: string; role: string; jti?: string; exp?: number; iat?: number; type?: string }
    validatedQuery?: Record<string, unknown>
  }

  interface Response {
    internalError?: (error: unknown, fallbackMessage?: string) => Response
  }
}
