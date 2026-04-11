import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errorHandler, notFoundHandler } from '@/middleware/error-handler'

vi.mock('@/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      id: 'test-user-id',
      email: 'admin@cedar.local',
      fullName: 'CEDAR Admin',
      roleCode: 'admin',
    }
    next()
  },
  requireAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  optionalAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAnonClient: vi.fn(() => ({
    schema: vi.fn(() => ({})),
  })),
  getSupabaseServiceClient: vi.fn(),
}))

import { submissionsRoutes } from '@/routes/admin/submissions.routes'
import { usersRoutes } from '@/routes/admin/users.routes'

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', submissionsRoutes)
  app.use('/api/admin/users', usersRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

describe('admin cursor pagination routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should reject invalid submissions cursor query values', async () => {
    const app = createTestApp()

    const response = await request(app)
      .get('/api/admin/submissions/cursor?first=0')

    expect(response.status).toBe(400)
  })

  it('should reject invalid users cursor query values', async () => {
    const app = createTestApp()

    const response = await request(app)
      .get('/api/admin/users/cursor?first=100')

    expect(response.status).toBe(400)
  })
})
