import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errorHandler, notFoundHandler } from '@/middleware/error-handler'
import { downloadRoutes } from '@/routes/files/download.routes'
import {
  downloadPrimaryThesisFileByThesisId,
  downloadThesisFile,
} from '@/services/file.service'

vi.mock('@/middleware/auth', () => ({
  optionalAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

vi.mock('@/services/file.service', () => ({
  downloadPrimaryThesisFileByThesisId: vi.fn(),
  downloadThesisFile: vi.fn(),
}))

const mockedDownloadByThesisId = vi.mocked(downloadPrimaryThesisFileByThesisId)
const mockedDownloadByFileId = vi.mocked(downloadThesisFile)

function createTestApp() {
  const app = express()
  app.use('/api/files', downloadRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

describe('downloadRoutes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should reject query downloads when thesisId is missing', async () => {
    const app = createTestApp()

    const response = await request(app)
      .get('/api/files/download')

    expect(response.status).toBe(400)
  })

  it('should return thesis file payload for query downloads', async () => {
    mockedDownloadByThesisId.mockResolvedValue({
      buffer: Buffer.from('sample-pdf-binary'),
      originalFilename: 'sample.pdf',
      contentType: 'application/pdf',
    })

    const app = createTestApp()

    const response = await request(app)
      .get('/api/files/download')
      .query({ thesisId: '123' })

    expect(response.status).toBe(200)
  })

  it('should return file payload for id downloads', async () => {
    mockedDownloadByFileId.mockResolvedValue({
      buffer: Buffer.from('sample-pdf-binary'),
      originalFilename: 'sample.pdf',
      contentType: 'application/pdf',
    })

    const app = createTestApp()

    const response = await request(app)
      .get('/api/files/download/77')

    expect(response.status).toBe(200)
  })
})
