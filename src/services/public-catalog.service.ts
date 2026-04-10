import { createClient } from '@/lib/supabase/server'
import type { RepositoryCategory, ThesisCollection, ThesisDetail, ThesisEntry } from '@/types/public/thesis-catalog'

type CollectionRow = {
  id: number
  slug: string
  title: string
  description: string | null
  default_item_type_code: string | null
  department_unit_id: number
}

type RepositoryItemRow = {
  id: number
  slug: string
  title: string
  abstract: string | null
  degree_name: string | null
  program_name: string | null
  language_code: string | null
  keywords: string[] | null
  citation_text: string | null
  publication_date: string | null
  defense_date: string | null
  embargo_until: string | null
  metadata: Record<string, unknown> | null
  collection_id: number
  owning_unit_id: number
  item_type_code: string
  workflow_status_code: string
  visibility_code: string
}

type UnitRow = {
  id: number
  name: string
}

type ContributorLinkRow = {
  repository_item_id: number
  contributor_role_code: string
  display_order: number
  is_primary: boolean
  contributors: {
    display_name: string
  } | {
    display_name: string
  }[] | null
}

type FileRow = {
  repository_item_id: number
  storage_object_path: string
  is_primary: boolean
}

type CollectionEntriesPage = {
  entries: ThesisEntry[]
  totalCount: number
  totalPages: number
  page: number
  pageSize: number
}

export type PublicSearchField = 'any' | 'title' | 'author' | 'keywords'

export type PublicSearchFilters = {
  query?: string
  field?: PublicSearchField
  fromDate?: string
  toDate?: string
  limit?: number
}

type PublicCatalogData = {
  collections: CollectionRow[]
  items: RepositoryItemRow[]
  contributorMap: Map<number, ContributorLinkRow[]>
  primaryFileMap: Map<number, string>
  unitNameById: Map<number, string>
}

const PUBLIC_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 100
const publicCatalogCache = new Map<string, { expiresAt: number; value: PublicCatalogData }>()

function nowInMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }

  return Date.now()
}

function logPerf(label: string, startAt: number, metadata?: Record<string, unknown>) {
  if (process.env.CEDAR_PERF_LOGS !== '1') {
    return
  }

  const durationMs = nowInMs() - startAt
  const extra = metadata ? ` ${JSON.stringify(metadata)}` : ''
  console.info(`[PERF] ${label} ${durationMs.toFixed(1)}ms${extra}`)
}

function parseSearchDate(value?: string) {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed)

  if (!match) {
    return undefined
  }

  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined
  }

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function sortByPublicationDateDesc(items: RepositoryItemRow[]) {
  return [...items].sort((left, right) => {
    const leftDate = left.publication_date ? Date.parse(left.publication_date) : 0
    const rightDate = right.publication_date ? Date.parse(right.publication_date) : 0
    return rightDate - leftDate
  })
}

function dedupeByItemId(items: RepositoryItemRow[]) {
  const byId = new Map<number, RepositoryItemRow>()
  for (const item of items) {
    byId.set(item.id, item)
  }

  return Array.from(byId.values())
}

function getItemTypeCodes(category?: RepositoryCategory) {
  if (category === 'faculty-work') {
    return ['faculty-research', 'faculty-creative-work']
  }

  if (category === 'college-thesis') {
    return ['thesis']
  }

  return ['thesis', 'faculty-research', 'faculty-creative-work']
}

function toRepositoryCategory(itemTypeCode: string): RepositoryCategory {
  return itemTypeCode === 'thesis' ? 'college-thesis' : 'faculty-work'
}

function toDisplayType(itemTypeCode: string): ThesisEntry['type'] {
  return itemTypeCode === 'thesis' ? 'Thesis/Dissertation' : 'Faculty Research'
}

function formatPublicationDate(publicationDate: string | null) {
  if (!publicationDate) {
    return 'Unknown date'
  }

  const parsedDate = new Date(publicationDate)

  if (Number.isNaN(parsedDate.getTime())) {
    return publicationDate
  }

  return parsedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function joinContributorNames(names: string[]) {
  return names.filter(Boolean).join('; ')
}

function arrayifyValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }

  return []
}

function getNestedContributorName(row: ContributorLinkRow) {
  if (Array.isArray(row.contributors)) {
    return row.contributors[0]?.display_name ?? ''
  }

  return row.contributors?.display_name ?? ''
}

async function loadPublicCatalogDataUncached(category?: RepositoryCategory): Promise<PublicCatalogData> {
  const perfStart = nowInMs()
  const supabase = await createClient()
  const schema = supabase.schema('public')
  const itemTypeCodes = getItemTypeCodes(category)

  const [collectionsQuery, itemsQuery, unitsQuery] = await Promise.all([
    schema
      .from('collections')
      .select('id,slug,title,description,default_item_type_code,department_unit_id')
      .in('default_item_type_code', itemTypeCodes)
      .order('title'),
    schema
      .from('repository_items')
      .select('id,slug,title,abstract,degree_name,program_name,language_code,keywords,citation_text,publication_date,defense_date,embargo_until,metadata,collection_id,owning_unit_id,item_type_code,workflow_status_code,visibility_code')
      .in('item_type_code', itemTypeCodes)
      .eq('workflow_status_code', 'published')
      .eq('visibility_code', 'public')
      .order('publication_date', { ascending: false }),
    schema.from('organizational_units').select('id,name'),
  ])

  if (collectionsQuery.error || itemsQuery.error || unitsQuery.error) {
    throw new Error(
      `Failed to load public repository catalog: ${collectionsQuery.error?.message ?? itemsQuery.error?.message ?? unitsQuery.error?.message ?? 'unknown query error'}`,
    )
  }

  const collections = (collectionsQuery.data ?? []) as CollectionRow[]
  const items = (itemsQuery.data ?? []) as RepositoryItemRow[]
  const units = new Map<number, string>(((unitsQuery.data ?? []) as UnitRow[]).map((unit) => [unit.id, unit.name]))

  const itemIds = items.map((item) => item.id)

  if (itemIds.length === 0) {
    return {
      collections,
      items,
      contributorMap: new Map<number, ContributorLinkRow[]>(),
      primaryFileMap: new Map<number, string>(),
      unitNameById: units,
    }
  }

  const [contributorsQuery, filesQuery] = await Promise.all([
    schema
      .from('repository_item_contributors')
      .select('repository_item_id,contributor_role_code,display_order,is_primary,contributors(display_name)')
      .in('repository_item_id', itemIds)
      .order('display_order'),
    schema
      .from('repository_item_files')
      .select('repository_item_id,storage_object_path,is_primary')
      .in('repository_item_id', itemIds)
      .eq('is_primary', true),
  ])

  if (contributorsQuery.error || filesQuery.error) {
    throw new Error(
      `Failed to load public repository catalog relations: ${contributorsQuery.error?.message ?? filesQuery.error?.message ?? 'unknown relation query error'}`,
    )
  }

  const contributorMap = new Map<number, ContributorLinkRow[]>()
  for (const row of (contributorsQuery.data ?? []) as ContributorLinkRow[]) {
    const existing = contributorMap.get(row.repository_item_id)
    if (existing) {
      existing.push(row)
      continue
    }
    contributorMap.set(row.repository_item_id, [row])
  }

  const primaryFileMap = new Map<number, string>()
  for (const file of (filesQuery.data ?? []) as FileRow[]) {
    if (file.is_primary) {
      primaryFileMap.set(file.repository_item_id, file.storage_object_path)
    }
  }

  const result = { collections, items, contributorMap, primaryFileMap, unitNameById: units }
  logPerf('public-catalog.load-uncached', perfStart, {
    category: category ?? 'all',
    items: items.length,
    collections: collections.length,
  })

  return result
}

async function loadPublicCatalogData(category?: RepositoryCategory): Promise<PublicCatalogData> {
  const cacheKey = category ?? 'all'
  const cached = publicCatalogCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value = await loadPublicCatalogDataUncached(category)
  if (publicCatalogCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = publicCatalogCache.keys().next().value
    if (oldest) publicCatalogCache.delete(oldest)
  }
  publicCatalogCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + PUBLIC_CATALOG_CACHE_TTL_MS,
  })

  return value
}

function buildDetail(
  item: RepositoryItemRow,
  departmentName: string,
  contributorLinks: ContributorLinkRow[],
): ThesisDetail {
  const advisorNames = contributorLinks
    .filter((link) => link.contributor_role_code === 'advisor')
    .map(getNestedContributorName)
    .filter(Boolean)
  const chairNames = contributorLinks
    .filter((link) => link.contributor_role_code === 'panel-chair')
    .map(getNestedContributorName)
    .filter(Boolean)
  const panelMemberNames = contributorLinks
    .filter((link) => link.contributor_role_code === 'panel-member')
    .map(getNestedContributorName)
    .filter(Boolean)

  return {
    publicationDate: item.publication_date ?? 'Not provided',
    documentType: toDisplayType(item.item_type_code),
    degreeName: item.degree_name ?? item.program_name ?? 'Not provided',
    subjectCategories:
      (typeof item.metadata?.subjectCategories === 'string' && item.metadata.subjectCategories) ||
      (item.keywords?.join(', ') ?? 'Not provided'),
    college: (typeof item.metadata?.college === 'string' && item.metadata.college) || 'College of Education',
    departmentUnit: departmentName,
    thesisAdvisor: joinContributorNames(advisorNames) || 'Not provided',
    defensePanelChair: joinContributorNames(chairNames) || 'Not provided',
    defensePanelMembers: panelMemberNames.length > 0 ? panelMemberNames : ['Not provided'],
    abstractSummary: arrayifyValue(item.metadata?.abstractSummary).length > 0
      ? arrayifyValue(item.metadata?.abstractSummary)
      : [item.abstract?.trim() || 'No abstract provided.'],
    language: item.language_code || (typeof item.metadata?.language === 'string' ? item.metadata.language : 'English'),
    format: (typeof item.metadata?.format === 'string' && item.metadata.format) || 'Electronic',
    keywords: item.keywords?.join(', ') || 'Not provided',
    recommendedCitation:
      item.citation_text ||
      `${joinContributorNames(contributorLinks.filter((link) => link.contributor_role_code === 'author' || link.contributor_role_code === 'co-author').map(getNestedContributorName))}. ${item.title}`,
    embargoPeriod: item.embargo_until ? `Until ${item.embargo_until}` : 'None',
  }
}

function mapItemToEntry(
  item: RepositoryItemRow,
  collectionSlug: string,
  departmentName: string,
  contributorLinks: ContributorLinkRow[],
  primaryFilePath?: string,
  options?: {
    includeDetail?: boolean
  },
): ThesisEntry {
  const authorNames = contributorLinks
    .filter((link) => link.contributor_role_code === 'author' || link.contributor_role_code === 'co-author')
    .sort((left, right) => left.display_order - right.display_order)
    .map(getNestedContributorName)
    .filter(Boolean)

  return {
    slug: item.slug,
    collectionSlug,
    title: item.title,
    authors: joinContributorNames(authorNames) || 'Unknown author',
    department: departmentName,
    date: formatPublicationDate(item.publication_date),
    type: toDisplayType(item.item_type_code),
    category: toRepositoryCategory(item.item_type_code),
    abstract: item.abstract?.trim() || 'No abstract provided.',
    tags: item.keywords?.join(', ') || 'Not provided',
    detail: options?.includeDetail === false ? undefined : buildDetail(item, departmentName, contributorLinks),
    filePath: primaryFilePath,
  }
}

function normalizePagination(page: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.min(100, pageSize))
  const safePage = Math.max(1, page)
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  return {
    page: safePage,
    pageSize: safePageSize,
    from,
    to,
  }
}

async function getCollectionRowBySlug(slug: string): Promise<CollectionRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('public')
    .from('collections')
    .select('id,slug,title,description,default_item_type_code,department_unit_id')
    .eq('slug', slug)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load collection: ${error.message}`)
  }

  return (data as CollectionRow | null) ?? null
}

async function loadRelatedDataForItems(itemIds: number[]) {
  if (itemIds.length === 0) {
    return {
      contributorMap: new Map<number, ContributorLinkRow[]>(),
      primaryFileMap: new Map<number, string>(),
    }
  }

  const supabase = await createClient()
  const schema = supabase.schema('public')

  const [contributorsQuery, filesQuery] = await Promise.all([
    schema
      .from('repository_item_contributors')
      .select('repository_item_id,contributor_role_code,display_order,is_primary,contributors(display_name)')
      .in('repository_item_id', itemIds)
      .order('display_order'),
    schema
      .from('repository_item_files')
      .select('repository_item_id,storage_object_path,is_primary')
      .in('repository_item_id', itemIds)
      .eq('is_primary', true),
  ])

  if (contributorsQuery.error || filesQuery.error) {
    throw new Error(
      `Failed to load public repository catalog relations: ${contributorsQuery.error?.message ?? filesQuery.error?.message ?? 'unknown relation query error'}`,
    )
  }

  const contributorMap = new Map<number, ContributorLinkRow[]>()
  for (const row of (contributorsQuery.data ?? []) as ContributorLinkRow[]) {
    const existing = contributorMap.get(row.repository_item_id)
    if (existing) {
      existing.push(row)
      continue
    }
    contributorMap.set(row.repository_item_id, [row])
  }

  const primaryFileMap = new Map<number, string>()
  for (const file of (filesQuery.data ?? []) as FileRow[]) {
    if (file.is_primary) {
      primaryFileMap.set(file.repository_item_id, file.storage_object_path)
    }
  }

  return { contributorMap, primaryFileMap }
}

async function loadUnitNameById(unitIds: number[]) {
  if (unitIds.length === 0) {
    return new Map<number, string>()
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('public')
    .from('organizational_units')
    .select('id,name')
    .in('id', unitIds)

  if (error) {
    throw new Error(`Failed to load organizational units: ${error.message}`)
  }

  return new Map<number, string>(((data ?? []) as UnitRow[]).map((unit) => [unit.id, unit.name]))
}

async function loadCollectionsById(collectionIds: number[]) {
  if (collectionIds.length === 0) {
    return new Map<number, CollectionRow>()
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('public')
    .from('collections')
    .select('id,slug,title,description,default_item_type_code,department_unit_id')
    .in('id', collectionIds)

  if (error) {
    throw new Error(`Failed to load collections for public search: ${error.message}`)
  }

  return new Map<number, CollectionRow>(((data ?? []) as CollectionRow[]).map((collection) => [collection.id, collection]))
}

async function loadAuthorMatchedItemIds(query: string) {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('public')
    .from('repository_item_contributors')
    .select('repository_item_id,contributors!inner(display_name)')
    .ilike('contributors.display_name', `%${trimmed}%`)

  if (error) {
    throw new Error(`Failed to load author-matched item ids: ${error.message}`)
  }

  const uniqueIds = new Set<number>()
  for (const row of (data ?? []) as { repository_item_id: number }[]) {
    uniqueIds.add(row.repository_item_id)
  }

  return Array.from(uniqueIds)
}

async function mapItemsToEntries(items: RepositoryItemRow[]) {
  if (items.length === 0) {
    return []
  }

  const itemIds = items.map((item) => item.id)
  const unitIds = Array.from(new Set(items.map((item) => item.owning_unit_id)))
  const collectionIds = Array.from(new Set(items.map((item) => item.collection_id)))

  const [{ contributorMap, primaryFileMap }, unitNameById, collectionById] = await Promise.all([
    loadRelatedDataForItems(itemIds),
    loadUnitNameById(unitIds),
    loadCollectionsById(collectionIds),
  ])

  return items
    .map((item) => {
      const collection = collectionById.get(item.collection_id)
      if (!collection) {
        return null
      }

      return mapItemToEntry(
        item,
        collection.slug,
        unitNameById.get(item.owning_unit_id) ?? 'College of Education',
        contributorMap.get(item.id) ?? [],
        primaryFileMap.get(item.id),
        { includeDetail: false },
      )
    })
    .filter((entry): entry is ThesisEntry => entry !== null)
}

async function querySearchItems(filters: {
  query: string
  field: PublicSearchField
  fromDateIso?: string
  toDateIso?: string
  limit: number
  allowedItemIds?: number[]
}) {
  const supabase = await createClient()
  const schema = supabase.schema('public')
  const itemTypeCodes = getItemTypeCodes()

  let queryBuilder = schema
    .from('repository_items')
    .select('id,slug,title,abstract,degree_name,program_name,language_code,keywords,citation_text,publication_date,defense_date,embargo_until,metadata,collection_id,owning_unit_id,item_type_code,workflow_status_code,visibility_code')
    .in('item_type_code', itemTypeCodes)
    .eq('workflow_status_code', 'published')
    .eq('visibility_code', 'public')
    .order('publication_date', { ascending: false })
    .limit(filters.limit)

  if (filters.fromDateIso) {
    queryBuilder = queryBuilder.gte('publication_date', filters.fromDateIso)
  }

  if (filters.toDateIso) {
    queryBuilder = queryBuilder.lte('publication_date', filters.toDateIso)
  }

  if (filters.allowedItemIds) {
    if (filters.allowedItemIds.length === 0) {
      return []
    }
    queryBuilder = queryBuilder.in('id', filters.allowedItemIds)
  }

  if (filters.query) {
    if (filters.field === 'title') {
      queryBuilder = queryBuilder.ilike('title', `%${filters.query}%`)
    } else if (filters.field === 'author') {
      // Author filtering uses allowedItemIds from contributor lookup.
    } else {
      queryBuilder = queryBuilder.textSearch('search_tsv', filters.query, { type: 'websearch' })
    }
  }

  const itemsQuery = await queryBuilder

  if (itemsQuery.error) {
    throw new Error(`Failed to load search items: ${itemsQuery.error.message}`)
  }

  return (itemsQuery.data ?? []) as RepositoryItemRow[]
}

export async function listThesisCollections(category: RepositoryCategory = 'college-thesis'): Promise<ThesisCollection[]> {
  const { collections, items } = await loadPublicCatalogData(category)
  const countByCollectionId = new Map<number, number>()

  for (const item of items) {
    countByCollectionId.set(item.collection_id, (countByCollectionId.get(item.collection_id) ?? 0) + 1)
  }

  return collections.map((collection) => ({
    slug: collection.slug,
    title: collection.title,
    count: countByCollectionId.get(collection.id) ?? 0,
    description: collection.description?.trim() || `Theses and dissertations submitted to ${collection.title}`,
    category,
  }))
}

export async function getThesisCollectionBySlug(slug: string): Promise<ThesisCollection | null> {
  const collection = await getCollectionRowBySlug(slug)

  if (!collection) {
    return null
  }

  const category = collection.default_item_type_code === 'thesis' ? 'college-thesis' : 'faculty-work'

  return {
    slug: collection.slug,
    title: collection.title,
    count: 0,
    description: collection.description?.trim() || `Theses and dissertations submitted to ${collection.title}`,
    category,
  }
}

export async function listThesesByCollectionSlugPage(
  collectionSlug: string,
  page: number,
  pageSize: number,
): Promise<CollectionEntriesPage> {
  const perfStart = nowInMs()
  const collection = await getCollectionRowBySlug(collectionSlug)

  if (!collection) {
    logPerf('public-catalog.collection-page', perfStart, {
      collectionSlug,
      page,
      pageSize,
      found: false,
    })

    return {
      entries: [],
      totalCount: 0,
      totalPages: 1,
      page: 1,
      pageSize,
    }
  }

  const pagination = normalizePagination(page, pageSize)
  const supabase = await createClient()
  const schema = supabase.schema('public')

  const countQuery = await schema
    .from('repository_items')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collection.id)
    .eq('workflow_status_code', 'published')
    .eq('visibility_code', 'public')

  if (countQuery.error) {
    throw new Error(`Failed to count collection entries: ${countQuery.error.message}`)
  }

  const totalCount = countQuery.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize))
  const safePage = Math.min(pagination.page, totalPages)
  const safePagination = normalizePagination(safePage, pagination.pageSize)

  const itemsQuery = await schema
    .from('repository_items')
    .select('id,slug,title,abstract,degree_name,program_name,language_code,keywords,citation_text,publication_date,defense_date,embargo_until,metadata,collection_id,owning_unit_id,item_type_code,workflow_status_code,visibility_code')
    .eq('collection_id', collection.id)
    .eq('workflow_status_code', 'published')
    .eq('visibility_code', 'public')
    .order('publication_date', { ascending: false })
    .range(safePagination.from, safePagination.to)

  if (itemsQuery.error) {
    throw new Error(`Failed to load collection entries: ${itemsQuery.error.message}`)
  }

  const items = (itemsQuery.data ?? []) as RepositoryItemRow[]
  const itemIds = items.map((item) => item.id)
  const unitIds = Array.from(new Set(items.map((item) => item.owning_unit_id)))

  const [{ contributorMap, primaryFileMap }, unitNameById] = await Promise.all([
    loadRelatedDataForItems(itemIds),
    loadUnitNameById(unitIds),
  ])

  const result = {
    entries: items.map((item) =>
      mapItemToEntry(
        item,
        collection.slug,
        unitNameById.get(item.owning_unit_id) ?? 'College of Education',
        contributorMap.get(item.id) ?? [],
        primaryFileMap.get(item.id),
        { includeDetail: false },
      ),
    ),
    totalCount,
    totalPages,
    page: safePage,
    pageSize: safePagination.pageSize,
  }

  logPerf('public-catalog.collection-page', perfStart, {
    collectionSlug,
    page: result.page,
    pageSize: result.pageSize,
    entries: result.entries.length,
    totalCount: result.totalCount,
  })

  return result
}

export async function listThesesByCollectionSlug(collectionSlug: string): Promise<ThesisEntry[]> {
  // Load all categories so faculty-research collections resolve correctly alongside thesis collections.
  const { collections, items, contributorMap, primaryFileMap, unitNameById } = await loadPublicCatalogData()
  const collection = collections.find((entry) => entry.slug === collectionSlug)

  if (!collection) {
    return []
  }

  return items
    .filter((item) => item.collection_id === collection.id)
    .map((item) =>
      mapItemToEntry(
        item,
        collection.slug,
        unitNameById.get(item.owning_unit_id) ?? 'College of Education',
        contributorMap.get(item.id) ?? [],
        primaryFileMap.get(item.id),
      ),
    )
}

export async function getThesisBySlugs(collectionSlug: string, thesisSlug: string): Promise<ThesisEntry | null> {
  const perfStart = nowInMs()
  const collection = await getCollectionRowBySlug(collectionSlug)

  if (!collection) {
    logPerf('public-catalog.thesis-detail', perfStart, {
      collectionSlug,
      thesisSlug,
      found: false,
    })

    return null
  }

  const supabase = await createClient()
  const schema = supabase.schema('public')
  const itemQuery = await schema
    .from('repository_items')
    .select('id,slug,title,abstract,degree_name,program_name,language_code,keywords,citation_text,publication_date,defense_date,embargo_until,metadata,collection_id,owning_unit_id,item_type_code,workflow_status_code,visibility_code')
    .eq('collection_id', collection.id)
    .eq('slug', thesisSlug)
    .eq('workflow_status_code', 'published')
    .eq('visibility_code', 'public')
    .maybeSingle()

  if (itemQuery.error && itemQuery.error.code !== 'PGRST116') {
    throw new Error(`Failed to load thesis entry: ${itemQuery.error.message}`)
  }

  if (!itemQuery.data) {
    logPerf('public-catalog.thesis-detail', perfStart, {
      collectionSlug,
      thesisSlug,
      found: false,
    })

    return null
  }

  const item = itemQuery.data as RepositoryItemRow
  const [{ contributorMap, primaryFileMap }, unitNameById] = await Promise.all([
    loadRelatedDataForItems([item.id]),
    loadUnitNameById([item.owning_unit_id]),
  ])

  const result = mapItemToEntry(
    item,
    collection.slug,
    unitNameById.get(item.owning_unit_id) ?? 'College of Education',
    contributorMap.get(item.id) ?? [],
    primaryFileMap.get(item.id),
    { includeDetail: true },
  )

  logPerf('public-catalog.thesis-detail', perfStart, {
    collectionSlug,
    thesisSlug,
    found: true,
  })

  return result
}

export async function listPublishedTheses(category?: RepositoryCategory): Promise<ThesisEntry[]> {
  const { collections, items, contributorMap, primaryFileMap, unitNameById } = await loadPublicCatalogData(category)
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]))

  return items
    .map((item) => {
      const collection = collectionById.get(item.collection_id)
      if (!collection) {
        return null
      }

      return mapItemToEntry(
        item,
        collection.slug,
        unitNameById.get(item.owning_unit_id) ?? 'College of Education',
        contributorMap.get(item.id) ?? [],
        primaryFileMap.get(item.id),
        { includeDetail: false },
      )
    })
    .filter((entry): entry is ThesisEntry => entry !== null)
}

export async function searchPublishedTheses(filters: PublicSearchFilters): Promise<ThesisEntry[]> {
  const perfStart = nowInMs()
  const query = (filters.query ?? '').trim()
  const field = filters.field ?? 'any'
  const fromDateIso = parseSearchDate(filters.fromDate)
  const toDateIso = parseSearchDate(filters.toDate)
  const limit = Math.max(1, Math.min(filters.limit ?? 200, 500))

  if (!query && !fromDateIso && !toDateIso) {
    return []
  }

  const authorMatchedIds = query && (field === 'author' || field === 'any')
    ? await loadAuthorMatchedItemIds(query)
    : []

  const primaryItems = await querySearchItems({
    query,
    field,
    fromDateIso,
    toDateIso,
    limit,
    allowedItemIds: field === 'author' ? authorMatchedIds : undefined,
  })

  const authorItems = field === 'any' && authorMatchedIds.length > 0
    ? await querySearchItems({
      query: '',
      field: 'author',
      fromDateIso,
      toDateIso,
      limit,
      allowedItemIds: authorMatchedIds,
    })
    : []

  const mergedItems = sortByPublicationDateDesc(dedupeByItemId([...primaryItems, ...authorItems])).slice(0, limit)
  const entries = await mapItemsToEntries(mergedItems)

  logPerf('public-catalog.search', perfStart, {
    field,
    queryLength: query.length,
    fromDate: fromDateIso ?? null,
    toDate: toDateIso ?? null,
    results: entries.length,
  })

  return entries
}

export async function listPublishedFacultyWorks(): Promise<ThesisEntry[]> {
  return listPublishedTheses('faculty-work')
}

export const publicCatalogTestables = {
  arrayifyValue,
  buildDetail,
  formatPublicationDate,
  getItemTypeCodes,
  getNestedContributorName,
  joinContributorNames,
  mapItemToEntry,
  toDisplayType,
  toRepositoryCategory,
}

