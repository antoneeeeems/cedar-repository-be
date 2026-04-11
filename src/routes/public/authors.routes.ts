import { Router, type Response } from 'express'

import { getAuthorBySlug, listAuthors } from '@/services/author-catalog.service'

const router = Router()

const AUTHOR_LIST_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120'
const AUTHOR_DETAIL_CACHE_CONTROL = 'public, max-age=120, stale-while-revalidate=600'

function setPublicCacheHeaders(response: Response, cacheControl: string) {
  response.setHeader('Cache-Control', cacheControl)
  response.setHeader('Vary', 'Accept-Encoding')
}

router.get(
  '/authors',
  async (req, res, next) => {
    try {
      const authors = await listAuthors(typeof req.query.query === 'string' ? req.query.query : undefined)
      setPublicCacheHeaders(res, AUTHOR_LIST_CACHE_CONTROL)
      res.json(authors)
    } catch (error) {
      next(error)
    }
  },
)

router.get('/authors/:slug', async (req, res, next) => {
  try {
    const author = await getAuthorBySlug(req.params.slug)
    setPublicCacheHeaders(res, AUTHOR_DETAIL_CACHE_CONTROL)
    res.json(author)
  } catch (error) {
    next(error)
  }
})

export const authorsRoutes = router
