import type { CorsOptions } from 'cors'

import { env } from '@/config/env'

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`CORS origin not allowed: ${origin}`))
  },
  credentials: true,
}
