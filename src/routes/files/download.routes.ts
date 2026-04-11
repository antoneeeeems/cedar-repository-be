import { Router } from 'express'

import { HttpError } from '@/middleware/error-handler'
import { optionalAuth } from '@/middleware/auth'
import { downloadPrimaryThesisFileByThesisId, downloadThesisFile } from '@/services/file.service'

const router = Router()

router.get('/download', optionalAuth, async (req, res, next) => {
  try {
    const thesisId = typeof req.query.thesisId === 'string' ? req.query.thesisId : null

    if (!thesisId) {
      throw new HttpError(400, 'thesisId query parameter is required.')
    }

    const file = await downloadPrimaryThesisFileByThesisId(thesisId, req.user?.id)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `inline; filename="${file.originalFilename}"`)
    res.setHeader('Content-Length', String(file.contentLength))
    if (file.contentEncoding) {
      res.setHeader('Content-Encoding', file.contentEncoding)
    }
    file.stream.on('error', next)
    file.stream.pipe(res)
  } catch (error) {
    next(error)
  }
})

router.get('/download/:fileId', optionalAuth, async (req, res, next) => {
  try {
    const file = await downloadThesisFile(String(req.params.fileId), req.user?.id)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `inline; filename="${file.originalFilename}"`)
    res.setHeader('Content-Length', String(file.contentLength))
    if (file.contentEncoding) {
      res.setHeader('Content-Encoding', file.contentEncoding)
    }
    file.stream.on('error', next)
    file.stream.pipe(res)
  } catch (error) {
    next(error)
  }
})

export const downloadRoutes = router
