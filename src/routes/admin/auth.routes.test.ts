import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errorHandler, notFoundHandler } from '@/middleware/error-handler'
import { authRoutes } from '@/routes/admin/auth.routes'
import { refreshAdminSession } from '@/services/auth.service'

vi.mock('@/middleware/auth', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  optionalAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAnonClient: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  buildAdminSession: vi.fn(),
  canAccessAdmin: vi.fn(),
  signInAdmin: vi.fn(),
  refreshAdminSession: vi.fn(),
}))

const mockedRefreshAdminSession = vi.mocked(refreshAdminSession)

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/auth', authRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

describe('authRoutes refresh endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should reject refresh requests without a token', async () => {
    const app = createTestApp()

    const response = await request(app)
      .post('/api/admin/auth/refresh')
      .send({})

    expect(response.status).toBe(400)
  })

  it('should return unauthorized when refresh fails', async () => {
    mockedRefreshAdminSession.mockResolvedValue({
      ok: false,
      message: 'Invalid refresh token.',
    })

    const app = createTestApp()

    const response = await request(app)
      .post('/api/admin/auth/refresh')
      .send({ refreshToken: 'bad-token' })

    expect(response.status).toBe(401)
  })

  it('should return session payload when refresh succeeds', async () => {
    mockedRefreshAdminSession.mockResolvedValue({
      ok: true,
      session: {
        name: 'CEDAR Admin',
        email: 'admin@cedar.local',
        role: 'Admin',
        loginAt: '2026-01-01T00:00:00.000Z',
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
      },
    })

    const app = createTestApp()

    const response = await request(app)
      .post('/api/admin/auth/refresh')
      .send({ refreshToken: 'good-token' })

    expect(response.body.session.token).toBe('new-access-token')
  })
})
