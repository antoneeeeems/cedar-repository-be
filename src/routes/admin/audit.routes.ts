import { Router } from 'express'

import { requireAdmin, requireAuth } from '@/middleware/auth'

import { getAdminRepository } from '@/routes/admin/get-admin-repository'

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/', async (req, res, next) => {
  try {
    const service = getAdminRepository(req)
    res.json(await service.listAuditEvents())
  } catch (error) {
    next(error)
  }
})

export const auditRoutes = router
