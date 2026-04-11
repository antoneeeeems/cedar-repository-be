import type { NextFunction, Request, Response } from 'express'

const SLOW_REQUEST_THRESHOLD_MS = 500

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now()

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt
    const requestLog = {
      type: 'http_request',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
      isSlow: durationMs > SLOW_REQUEST_THRESHOLD_MS,
    }

    if (requestLog.isSlow) {
      console.warn(JSON.stringify(requestLog))
      return
    }

    console.info(JSON.stringify(requestLog))
  })

  next()
}
