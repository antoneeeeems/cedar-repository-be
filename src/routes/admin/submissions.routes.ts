import { Router } from 'express'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { validateRequest } from '@/middleware/validate'
import { ApiAdminRepository } from '@/services/admin.service'
import type { SubmissionCursorQuery } from '@/types/admin'

const router = Router()

router.use(requireAuth, requireAdmin)

const submissionIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/),
})

const submissionDraftSchema = z
  .object({
    title: z.string(),
    firstName: z.string(),
    middleName: z.string(),
    lastName: z.string(),
    publishedOn: z.string(),
    department: z.string(),
    documentType: z.string(),
    degree: z.string(),
    thesisAdvisor: z.string(),
    panelChair: z.string(),
    panelMembers: z.string(),
    keywords: z.string(),
    abstract: z.string(),
    fileName: z.string(),
    fileSize: z.number().optional(),
  })
  .partial()

const submissionsCursorQuerySchema = z.object({
  first: z.coerce.number().int().min(1).max(50).default(8),
  after: z.string().min(1).optional(),
  search: z.string().optional(),
  department: z.string().optional(),
  status: z.enum([
    'all-status',
    'Draft',
    'Pending Review',
    'Under Review',
    'Approved',
    'Rejected',
    'Revision Requested',
    'Published',
    'Archived',
  ]).optional(),
  sortOrder: z.enum(['date-desc', 'date-asc']).optional(),
})

router.get(
  '/submissions/cursor',
  validateRequest({
    query: submissionsCursorQuerySchema,
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.listSubmissionsCursor(req.query as unknown as SubmissionCursorQuery))
    } catch (error) {
      next(error)
    }
  },
)

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

router.put(
  '/submissions/draft',
  validateRequest({
    body: submissionDraftSchema,
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.saveSubmissionDraft(req.body))
    } catch (error) {
      next(error)
    }
  },
)

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
      email: z.email(),
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

router.get(
  '/submissions/:id',
  validateRequest({
    params: submissionIdParamsSchema,
  }),
  async (req, res, next) => {
    try {
      const submissionId = req.params.id as string
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.getSubmissionById(submissionId))
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/submissions/:id/reviews',
  validateRequest({
    params: submissionIdParamsSchema,
  }),
  async (req, res, next) => {
    try {
      const submissionId = req.params.id as string
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.getSubmissionReviewHistory(submissionId))
    } catch (error) {
      next(error)
    }
  },
)

router.post(
  '/submissions/:id/review',
  validateRequest({
    params: submissionIdParamsSchema,
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
      const submissionId = req.params.id as string
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(
        await service.reviewSubmission(
          submissionId,
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
