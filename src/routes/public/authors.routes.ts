import { Router } from 'express'

import { getAuthorBySlug, listAuthors } from '@/services/author-catalog.service'

const router = Router()

router.get(
  '/authors',
  async (req, res, next) => {
    try {
      const authors = await listAuthors(typeof req.query.query === 'string' ? req.query.query : undefined)
      res.json(authors)
    } catch (error) {
      next(error)
    }
  },
)

router.get('/authors/:slug', async (req, res, next) => {
  try {
    const author = await getAuthorBySlug(req.params.slug)
    res.json(author)
  } catch (error) {
    next(error)
  }
})

export const authorsRoutes = router
