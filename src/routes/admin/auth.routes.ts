import { Router } from 'express'
import { z } from 'zod'

import { requireAuth, requireAdmin } from '@/middleware/auth'
import { HttpError } from '@/middleware/error-handler'
import { validateRequest } from '@/middleware/validate'
import { buildAdminSession, canAccessAdmin, signInAdmin } from '@/services/auth.service'
import { getSupabaseAnonClient } from '@/lib/supabase'

const router = Router()

router.post(
  '/login',
  validateRequest({
    body: z.object({
      email: z.string().email(),
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

router.get('/session', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const accessToken = String(req.headers.authorization).replace(/^Bearer\s+/i, '')
    const { data, error } = await getSupabaseAnonClient(accessToken)
      .schema('public')
      .from('profiles')
      .select('full_name,email,role_code,user_status_code')
      .eq('id', req.user!.id)
      .maybeSingle()

    if (error || !data || !canAccessAdmin(data)) {
      throw new HttpError(403, 'Admin session is invalid.')
    }

    res.json({
      session: buildAdminSession({
        profile: data,
        fallbackEmail: req.user!.email,
        accessToken: String(req.headers.authorization).replace(/^Bearer\s+/i, ''),
      }),
    })
  } catch (error) {
    next(error)
  }
})

export const authRoutes = router
