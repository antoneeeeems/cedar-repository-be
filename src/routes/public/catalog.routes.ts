import { Router } from 'express'

import {
  getThesisBySlugs,
  getThesisCollectionBySlug,
  listPublishedTheses,
  listThesesByCollectionSlugPage,
  listThesisCollections,
  searchPublishedTheses,
} from '@/services/public-catalog.service'

const router = Router()

router.get(
  '/collections',
  async (req, res, next) => {
    try {
      const category = req.query.category === 'faculty-work' ? 'faculty-work' : 'college-thesis'
      const result = await listThesisCollections(category)
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

router.get('/collections/:slug', async (req, res, next) => {
  try {
    const result = await getThesisCollectionBySlug(req.params.slug)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.get(
  '/collections/:slug/items',
  async (req, res, next) => {
    try {
      const result = await listThesesByCollectionSlugPage(
        String(req.params.slug),
        Number(req.query.page ?? 1),
        Number(req.query.pageSize ?? 10),
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

router.get('/items/:collectionSlug/:thesisSlug', async (req, res, next) => {
  try {
    const result = await getThesisBySlugs(req.params.collectionSlug, req.params.thesisSlug)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.get(
  '/items',
  async (req, res, next) => {
    try {
      const category = req.query.category === 'faculty-work' ? 'faculty-work' : undefined
      const result = await listPublishedTheses(category)
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/search',
  async (req, res, next) => {
    try {
      const result = await searchPublishedTheses({
        query: typeof req.query.query === 'string' ? req.query.query : undefined,
        field: req.query.field as 'any' | 'title' | 'author' | 'keywords' | undefined,
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

export const catalogRoutes = router
