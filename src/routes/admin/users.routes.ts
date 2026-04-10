import { Router } from 'express'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { validateRequest } from '@/middleware/validate'
import { ApiAdminRepository } from '@/services/admin.service'

const router = Router()

router.use(requireAuth, requireAdmin)

const userRoleSchema = z.enum(['Super Admin', 'Admin', 'Student'])
const userStatusSchema = z.enum(['Active', 'Inactive', 'Pending'])

const userIdParamsSchema = z.object({
  id: z.uuid(),
})

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  role: userRoleSchema,
  status: userStatusSchema,
  department: z.string().default(''),
  lastLogin: z.string().default('Never'),
  dateAdded: z.string().optional(),
})

const updateUserSchema = createUserSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'At least one field must be provided for update.',
})

router.get('/', async (req, res, next) => {
  try {
    const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
    res.json(await service.listUsers())
  } catch (error) {
    next(error)
  }
})

router.post(
  '/',
  validateRequest({
    body: createUserSchema,
  }),
  async (req, res, next) => {
    try {
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.createUser(req.body))
    } catch (error) {
      next(error)
    }
  },
)

router.patch(
  '/:id',
  validateRequest({
    params: userIdParamsSchema,
    body: updateUserSchema,
  }),
  async (req, res, next) => {
    try {
      const userId = req.params.id as string
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      res.json(await service.updateUser(userId, req.body))
    } catch (error) {
      next(error)
    }
  },
)

router.delete(
  '/:id',
  validateRequest({
    params: userIdParamsSchema,
  }),
  async (req, res, next) => {
    try {
      const userId = req.params.id as string
      const service = new ApiAdminRepository(req.user?.id ?? null, String(req.headers.authorization).replace(/^Bearer\s+/i, ''))
      await service.deleteUser(userId)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)

export const usersRoutes = router
