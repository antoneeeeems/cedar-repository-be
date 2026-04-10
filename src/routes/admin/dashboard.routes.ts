import { Router } from 'express'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { ApiAdminRepository } from '@/services/admin.service'

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    const snapshot = await service.getDashboardSnapshot()
    res.json(snapshot)
  } catch (error) {
    next(error)
  }
})

export const dashboardRoutes = router
