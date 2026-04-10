import { Router } from 'express'

import { auditRoutes } from '@/routes/admin/audit.routes'
import { authRoutes } from '@/routes/admin/auth.routes'
import { dashboardRoutes } from '@/routes/admin/dashboard.routes'
import { reportsRoutes } from '@/routes/admin/reports.routes'
import { settingsRoutes } from '@/routes/admin/settings.routes'
import { submissionsRoutes } from '@/routes/admin/submissions.routes'
import { usersRoutes } from '@/routes/admin/users.routes'
import { downloadRoutes } from '@/routes/files/download.routes'
import { uploadRoutes } from '@/routes/files/upload.routes'
import { authorsRoutes } from '@/routes/public/authors.routes'
import { catalogRoutes } from '@/routes/public/catalog.routes'

export function createRouter() {
  const router = Router()

  router.use('/api/public', catalogRoutes)
  router.use('/api/public', authorsRoutes)
  router.use('/api/admin/auth', authRoutes)
  router.use('/api/admin/dashboard', dashboardRoutes)
  router.use('/api/admin', submissionsRoutes)
  router.use('/api/admin/users', usersRoutes)
  router.use('/api/admin/settings', settingsRoutes)
  router.use('/api/admin/reports', reportsRoutes)
  router.use('/api/admin/audit-events', auditRoutes)
  router.use('/api/files', uploadRoutes)
  router.use('/api/files', downloadRoutes)

  return router
}
