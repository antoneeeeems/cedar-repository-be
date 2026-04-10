import { Router } from 'express'

import { optionalAuth } from '@/middleware/auth'
import { downloadThesisFile } from '@/services/file.service'

const router = Router()

router.get('/download/:fileId', optionalAuth, async (req, res, next) => {
  try {
    const file = await downloadThesisFile(String(req.params.fileId), req.user?.id)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `inline; filename="${file.originalFilename}"`)
    if (file.contentEncoding) {
      res.setHeader('Content-Encoding', file.contentEncoding)
    }
    res.send(file.buffer)
  } catch (error) {
    next(error)
  }
})

export const downloadRoutes = router
