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

const scheduledReportIdParamsSchema = z.object({
  id: z.uuid(),
})

const scheduledReportSchema = z.object({
  preset: z.enum([
    'executive-summary',
    'submission-pipeline',
    'department-performance',
    'user-access-usage',
    'audit-trail',
  ]),
  format: z.enum(['csv', 'json', 'pdf', 'xlsx']),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  recipientEmail: z.email(),
  enabled: z.boolean(),
  lastRunAt: z.string().optional(),
})

const scheduledReportPatchSchema = scheduledReportSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'At least one field must be provided for update.',
})

router.get(
  '/snapshot',
  validateRequest({
    query: reportFiltersSchema,
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.getReportSnapshot(req.query))
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/snapshot-with-data',
  validateRequest({
    query: reportFiltersSchema,
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.getReportSnapshotWithData(req.query))
    } catch (error) {
      next(error)
    }
  },
)

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
          req.query.preset as import('@/types/admin').ReportExportPreset,
          req.query.format as import('@/types/admin').ReportExportFormat,
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

router.post(
  '/scheduled',
  validateRequest({
    body: scheduledReportSchema,
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.createScheduledReport(req.body))
    } catch (error) {
      next(error)
    }
  },
)

router.patch(
  '/scheduled/:id',
  validateRequest({
    params: scheduledReportIdParamsSchema,
    body: scheduledReportPatchSchema,
  }),
  async (req, res, next) => {
    try {
      const scheduleId = req.params.id as string
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.updateScheduledReport(scheduleId, req.body))
    } catch (error) {
      next(error)
    }
  },
)

router.delete(
  '/scheduled/:id',
  validateRequest({
    params: scheduledReportIdParamsSchema,
  }),
  async (req, res, next) => {
    try {
      const scheduleId = req.params.id as string
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      await service.deleteScheduledReport(scheduleId)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)

export const reportsRoutes = router
