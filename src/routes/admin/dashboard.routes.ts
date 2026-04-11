import { Router } from 'express'

import { requireAdmin, requireAuth } from '@/middleware/auth'

import { getAdminRepository } from '@/routes/admin/get-admin-repository'

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/', async (req, res, next) => {
  try {
    const service = getAdminRepository(req)
    const snapshot = await service.getDashboardSnapshot()
    res.json(snapshot)
  } catch (error) {
    next(error)
  }
})

export const dashboardRoutes = router
