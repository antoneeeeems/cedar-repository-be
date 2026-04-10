import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import { corsOptions } from '@/config/cors'
import { errorHandler, notFoundHandler } from '@/middleware/error-handler'
import { requestLogger } from '@/middleware/request-logger'
import { createRouter } from '@/routes'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '5mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(requestLogger)

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.use(createRouter())
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
