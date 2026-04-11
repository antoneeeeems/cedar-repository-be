import { Router } from 'express'
import { z } from 'zod'

import { requireAuth, requireAdmin } from '@/middleware/auth'
import { HttpError } from '@/middleware/error-handler'
import { validateRequest } from '@/middleware/validate'
import { buildAdminSession, refreshAdminSession, signInAdmin } from '@/services/auth.service'

const router = Router()

router.post(
  '/login',
  validateRequest({
    body: z.object({
      email: z.email(),
      password: z.string().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await signInAdmin(req.body.email, req.body.password)

      if (!result.ok) {
        throw new HttpError(401, result.message)
      }

      res.json({ session: result.session })
    } catch (error) {
      next(error)
    }
  },
)

router.post('/logout', requireAuth, async (_req, res) => {
  res.status(204).send()
})

router.post(
  '/refresh',
  validateRequest({
    body: z.object({
      refreshToken: z.string().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await refreshAdminSession(req.body.refreshToken)

      if (!result.ok) {
        throw new HttpError(401, result.message)
      }

      res.json({ session: result.session })
    } catch (error) {
      next(error)
    }
  },
)

router.get('/session', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization
    if (typeof authorizationHeader !== 'string') {
      throw new HttpError(403, 'Admin session is invalid.')
    }

    const accessToken = authorizationHeader.replace(/^Bearer\s+/i, '')
    if (!req.user) {
      throw new HttpError(403, 'Admin session is invalid.')
    }

    res.json({
      session: buildAdminSession({
        profile: {
          full_name: req.user.fullName,
          email: req.user.email,
          role_code: req.user.roleCode,
          user_status_code: req.user.userStatusCode,
        },
        fallbackEmail: req.user.email,
        accessToken,
      }),
    })
  } catch (error) {
    next(error)
  }
})

export const authRoutes = router
