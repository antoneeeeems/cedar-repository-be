import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ZodObject, ZodType } from 'zod'

import { HttpError } from '@/middleware/error-handler'

type ValidationShape = {
  body?: ZodType
  params?: ZodObject
  query?: ZodObject
}

export function validateRequest(schemas: ValidationShape): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body)
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params']
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as Request['query']
      }

      next()
    } catch (error) {
      next(new HttpError(400, 'Request validation failed.', 'validation_error', error))
    }
  }
}
