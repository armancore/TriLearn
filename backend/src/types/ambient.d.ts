declare module 'cookie-parser'
declare module 'swagger-ui-express'
declare module 'jsonwebtoken'

declare namespace Express {
  interface Request {
    id?: string
    logger?: {
      child?: (context: Record<string, unknown>) => Request['logger']
      error?: (message: string, meta?: Record<string, unknown>) => void
      warn?: (message: string, meta?: Record<string, unknown>) => void
      info?: (message: string, meta?: Record<string, unknown>) => void
    }
    user?: any
    student?: any
    instructor?: any
    coordinator?: any
    gatekeeper?: any
    mobileAppVersion?: string
  }

  interface Response {
    internalError?: (error: unknown) => void
  }
}
