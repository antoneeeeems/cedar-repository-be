import type { NextFunction, Request, Response } from 'express'

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now()

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt
    console.info(
      JSON.stringify({
        type: 'http_request',
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      }),
    )
  })

  next()
}
