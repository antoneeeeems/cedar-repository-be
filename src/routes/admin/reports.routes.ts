import { Router } from 'express'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { validateRequest } from '@/middleware/validate'
import { ApiAdminRepository } from '@/services/admin.service'

const router = Router()

router.use(requireAuth, requireAdmin)

const reportFiltersSchema = z.object({
  range: z.enum(['30d', '90d', 'ytd', 'all']).optional(),
  department: z.string().optional(),
  status: z.string().optional(),
})

router.get('/snapshot', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.getReportSnapshot(req.query))
  } catch (error) {
    next(error)
  }
})

router.get('/snapshot-with-data', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.getReportSnapshotWithData(req.query))
  } catch (error) {
    next(error)
  }
})

router.get(
  '/export',
  validateRequest({
    query: reportFiltersSchema.extend({
      preset: z.enum([
        'executive-summary',
        'submission-pipeline',
        'department-performance',
        'user-access-usage',
        'audit-trail',
      ]),
      format: z.enum(['csv', 'json', 'pdf', 'xlsx']),
    }),
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(
        await service.getReportExportPayload(
          String(req.query.preset) as import('@/types/admin').ReportExportPreset,
          String(req.query.format) as import('@/types/admin').ReportExportFormat,
          req.query,
        ),
      )
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/yoy',
  validateRequest({
    query: z.object({
      range: z.enum(['30d', '90d', 'ytd', 'all']).default('30d'),
    }),
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.getYearOverYearComparison())
    } catch (error) {
      next(error)
    }
  },
)

router.get('/scheduled', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.listScheduledReports())
  } catch (error) {
    next(error)
  }
})

router.post('/scheduled', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.createScheduledReport(req.body))
  } catch (error) {
    next(error)
  }
})

router.patch('/scheduled/:id', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.updateScheduledReport(req.params.id, req.body))
  } catch (error) {
    next(error)
  }
})

router.delete('/scheduled/:id', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    await service.deleteScheduledReport(req.params.id)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

export const reportsRoutes = router
