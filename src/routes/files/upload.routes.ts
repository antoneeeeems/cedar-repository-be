import { Router } from 'express'
import multer from 'multer'

import { requireAdmin, requireAuth } from '@/middleware/auth'
import { HttpError } from '@/middleware/error-handler'
import { uploadThesisFile } from '@/services/file.service'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
})

router.post('/upload', requireAuth, requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new HttpError(400, 'A PDF file is required.')
    }

    if (!req.body.thesis_id) {
      throw new HttpError(400, 'thesis_id is required.')
    }

    const uploaded = await uploadThesisFile({
      thesisId: String(req.body.thesis_id),
      uploadedByProfileId: req.user!.id,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    })

    res.status(201).json(uploaded)
  } catch (error) {
    next(error)
  }
})

export const uploadRoutes = router
