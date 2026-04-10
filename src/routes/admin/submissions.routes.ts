import { Router } from 'express'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { validateRequest } from '@/middleware/validate'
import { ApiAdminRepository } from '@/services/admin.service'

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/submissions', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.listSubmissions())
  } catch (error) {
    next(error)
  }
})

router.get('/submissions/summary', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.getSubmissionSummaryCards())
  } catch (error) {
    next(error)
  }
})

router.get('/submissions/draft', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.getSubmissionDraft())
  } catch (error) {
    next(error)
  }
})

router.put('/submissions/draft', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.saveSubmissionDraft(req.body))
  } catch (error) {
    next(error)
  }
})

router.delete('/submissions/draft', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    await service.clearSubmissionDraft()
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

router.post(
  '/submissions/draft/submit',
  validateRequest({
    body: z.object({
      name: z.string().min(1),
      email: z.string().email(),
    }),
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.submitSubmissionDraft(req.body))
    } catch (error) {
      next(error)
    }
  },
)

router.get('/submissions/:id', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.getSubmissionById(req.params.id))
  } catch (error) {
    next(error)
  }
})

router.get('/submissions/:id/reviews', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.getSubmissionReviewHistory(req.params.id))
  } catch (error) {
    next(error)
  }
})

router.post(
  '/submissions/:id/review',
  validateRequest({
    body: z.object({
      action: z.enum(['approve', 'revise', 'reject']),
      actor: z.string().min(1).optional(),
      payload: z
        .object({
          comment: z.string().optional(),
          issues: z.array(z.string()).optional(),
          adminNotes: z.string().optional(),
        })
        .default({}),
    }),
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(
        await service.reviewSubmission(
          String(req.params.id),
          req.body.action,
          req.body.actor ?? req.user?.fullName ?? req.user?.email ?? 'CEDAR Admin',
          req.body.payload,
        ),
      )
    } catch (error) {
      next(error)
    }
  },
)

router.get('/student/submissions', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.listStudentSubmissions(req.user?.email ?? ''))
  } catch (error) {
    next(error)
  }
})

router.get('/student/dashboard', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.getStudentDashboardSnapshot(req.user?.email ?? ''))
  } catch (error) {
    next(error)
  }
})

export const submissionsRoutes = router
