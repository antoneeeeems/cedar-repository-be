import { Router } from 'express'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { validateRequest } from '@/middleware/validate'

import { getAdminRepository } from '@/routes/admin/get-admin-repository'

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/', async (req, res, next) => {
  try {
    const service = getAdminRepository(req)
    res.json(await service.getSettings())
  } catch (error) {
    next(error)
  }
})

router.patch(
  '/:section',
  validateRequest({
    params: z.object({
      section: z.enum([
        'general',
        'notifications',
        'access',
        'compliance',
        'auditRetention',
        'profile',
        'appearance',
      ]),
    }),
  }),
  async (req, res, next) => {
    try {
      const service = getAdminRepository(req)
      res.json(await service.updateSettings(String(req.params.section) as keyof import('@/types/admin').AllSettings, req.body))
    } catch (error) {
      next(error)
    }
  },
)

export const settingsRoutes = router
