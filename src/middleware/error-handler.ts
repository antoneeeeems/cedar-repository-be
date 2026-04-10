import type { NextFunction, Request, Response } from 'express'

import type { ErrorResponseBody } from '@/types/api'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'Route not found.'))
}

export function errorHandler(error: unknown, _req: Request, res: Response<ErrorResponseBody>, _next: NextFunction) {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        message: error.message,
        status: error.status,
        code: error.code,
        details: error.details,
      },
    })
    return
  }

  if (error instanceof Error) {
    res.status(500).json({
      error: {
        message: error.message,
        status: 500,
      },
    })
    return
  }

  res.status(500).json({
    error: {
      message: 'Unexpected server error.',
      status: 500,
    },
  })
}
