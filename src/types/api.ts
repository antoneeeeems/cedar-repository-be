import type { AdminSession } from '@/types/admin'

export type ErrorResponseBody = {
  error: {
    message: string
    status: number
    code?: string
    details?: unknown
  }
}

export type AuthLoginRequest = {
  email: string
  password: string
}

export type AuthLoginResponse = {
  session: AdminSession
}

export type PaginationQuery = {
  page?: number
  pageSize?: number
}
