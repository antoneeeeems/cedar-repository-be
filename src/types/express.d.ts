export {}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        fullName?: string | null
        roleCode?: string | null
        userStatusCode?: string | null
      }
    }
  }
}
