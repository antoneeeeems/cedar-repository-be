import { Router } from 'express'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { validateRequest } from '@/middleware/validate'
import type { UserCursorQuery } from '@/types/admin'

import { getAdminRepository } from '@/routes/admin/get-admin-repository'

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

const usersCursorQuerySchema = z.object({
  first: z.coerce.number().int().min(1).max(50).default(8),
  after: z.string().min(1).optional(),
  search: z.string().optional(),
})

router.get(
  '/cursor',
  validateRequest({
    query: usersCursorQuerySchema,
  }),
  async (req, res, next) => {
    try {
      const service = getAdminRepository(req)
      res.json(await service.listUsersCursor(req.query as unknown as UserCursorQuery))
    } catch (error) {
      next(error)
    }
  },
)

router.get('/', async (req, res, next) => {
  try {
    const service = getAdminRepository(req)
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
      const service = getAdminRepository(req)
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
      const service = getAdminRepository(req)
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
      const service = getAdminRepository(req)
      await service.deleteUser(userId)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)

export const usersRoutes = router
