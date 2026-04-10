import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import { env } from '@/config/env'
import { getSupabaseAnonClient } from '@/lib/supabase'
import { HttpError } from '@/middleware/error-handler'
import { canAccessAdmin } from '@/services/auth.service'

type JwtPayload = {
  sub?: string
  email?: string
}

function extractBearerToken(req: Request) {
  const header = req.headers.authorization

  if (!header) {
    return null
  }

  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return null
  }

  return token
}

async function decodeAccessToken(token: string) {
  if (env.SUPABASE_JWT_SECRET) {
    try {
      const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET, {
        algorithms: ['HS256'],
      }) as JwtPayload

      if (payload.sub && payload.email) {
        return payload
      }
    } catch {
      // Fall back to Supabase token introspection when a raw JWT secret is unavailable or incorrect.
    }
  }

  const { data, error } = await getSupabaseAnonClient(token).auth.getUser()

  if (error || !data.user?.id || !data.user.email) {
    throw new HttpError(401, 'Token validation failed.', 'invalid_token')
  }

  return {
    sub: data.user.id,
    email: data.user.email,
  } satisfies JwtPayload
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req)

  if (!token) {
    next()
    return
  }

  try {
    const payload = await decodeAccessToken(token)
    req.user = {
      id: payload.sub!,
      email: payload.email!,
    }
    next()
  } catch (error) {
    next(error)
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req)

  if (!token) {
    next(new HttpError(401, 'Authorization header is required.'))
    return
  }

  try {
    const payload = await decodeAccessToken(token)
    req.user = {
      id: payload.sub!,
      email: payload.email!,
    }
    next()
  } catch (error) {
    next(error)
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      next(new HttpError(401, 'Authentication is required.'))
      return
    }

    const token = extractBearerToken(req)

    if (!token) {
      next(new HttpError(401, 'Authorization header is required.'))
      return
    }

    const { data, error } = await getSupabaseAnonClient(token)
      .schema('public')
      .from('profiles')
      .select('id,email,full_name,role_code,user_status_code')
      .eq('id', req.user.id)
      .maybeSingle()

    if (error || !data) {
      next(new HttpError(403, 'Admin profile not found.'))
      return
    }

    if (!canAccessAdmin(data)) {
      next(new HttpError(403, 'This account does not have admin access.'))
      return
    }

    req.user = {
      id: data.id,
      email: data.email ?? req.user.email,
      fullName: data.full_name,
      roleCode: data.role_code,
      userStatusCode: data.user_status_code,
    }

    next()
  } catch (error) {
    next(error)
  }
}
