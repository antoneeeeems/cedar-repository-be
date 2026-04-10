import type { AuthorProfile, AuthorSummary } from '@/types/public/author-catalog'
import type { ThesisEntry } from '@/types/public/thesis-catalog'
import { listPublishedTheses } from '@/lib/public/thesis/supabase-thesis-repository'
import {
  getAuthorMatchKeys,
  pickPreferredAuthorDisplayName,
  splitAuthors,
  toAuthorSlug,
} from '@/lib/public/authors/author-utils'

type AuthorAccumulator = {
  names: Set<string>
  worksById: Map<string, ThesisEntry>
}

type AuthorCluster = {
  slug: string
  displayName: string
  aliases: string[]
  works: ThesisEntry[]
  matchKeys: Set<string>
}

const AUTHOR_CLUSTER_CACHE_TTL_MS = 5 * 60 * 1000
let authorClusterCache: {
  expiresAt: number
  clusters: AuthorCluster[]
} | null = null

function getDateSortScore(dateLabel: string) {
  if (dateLabel.toLowerCase().includes('unknown')) {
    return 0
  }

  const parsed = Date.parse(dateLabel)
  return Number.isNaN(parsed) ? 0 : parsed
}

function getMostCommon(items: string[]) {
  if (items.length === 0) {
    return 'College of Education'
  }

  const countByValue = new Map<string, number>()

  for (const item of items) {
    if (!item) {
      continue
    }
    countByValue.set(item, (countByValue.get(item) ?? 0) + 1)
  }

  const sorted = Array.from(countByValue.entries()).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? 'College of Education'
}

function getTopResearchAreas(works: ThesisEntry[]) {
  const tagCount = new Map<string, number>()

  for (const work of works) {
    const tags = work.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    for (const tag of tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
    }
  }

  return Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag)
}

function resolveClusterKey(matchKeys: string[], keyToClusterKey: Map<string, string>) {
  for (const key of matchKeys) {
    const existing = keyToClusterKey.get(key)
    if (existing) {
      return existing
    }
  }

  return matchKeys[0]
}

function updateAccumulator(
  accumulators: Map<string, AuthorAccumulator>,
  clusterKey: string,
  contributor: string,
  work: ThesisEntry,
) {
  const existingAccumulator = accumulators.get(clusterKey)

  if (existingAccumulator) {
    existingAccumulator.names.add(contributor)
    existingAccumulator.worksById.set(`${work.collectionSlug}/${work.slug}`, work)
    return
  }

  accumulators.set(clusterKey, {
    names: new Set([contributor]),
    worksById: new Map([[`${work.collectionSlug}/${work.slug}`, work]]),
  })
}

function registerMatchKeys(
  keyToClusterKey: Map<string, string>,
  matchKeys: string[],
  contributorSlug: string,
  clusterKey: string,
) {
  for (const key of matchKeys) {
    keyToClusterKey.set(key, clusterKey)
  }

  keyToClusterKey.set(contributorSlug, clusterKey)
}

function buildCluster(accumulator: AuthorAccumulator, clusterKey: string): AuthorCluster {
  const names = Array.from(accumulator.names)
  const displayName = pickPreferredAuthorDisplayName(names)
  const fallbackName = names[0] || ''
  const canonicalName = displayName || fallbackName
  const slug = toAuthorSlug(canonicalName) || clusterKey
  const aliases = names.filter((name) => name !== canonicalName).sort((a, b) => a.localeCompare(b))

  const worksForCluster = Array.from(accumulator.worksById.values()).sort(
    (left, right) => getDateSortScore(right.date) - getDateSortScore(left.date),
  )

  const keys = new Set<string>()
  for (const name of names) {
    keys.add(toAuthorSlug(name))
    for (const key of getAuthorMatchKeys(name)) {
      keys.add(key)
    }
  }

  keys.add(slug)

  return {
    slug,
    displayName: canonicalName,
    aliases,
    works: worksForCluster,
    matchKeys: keys,
  }
}

function buildAuthorClusters(works: ThesisEntry[]) {
  const accumulators = new Map<string, AuthorAccumulator>()
  const keyToClusterKey = new Map<string, string>()

  for (const work of works) {
    const contributors = splitAuthors(work.authors)

    for (const contributor of contributors) {
      const contributorSlug = toAuthorSlug(contributor)
      const matchKeys = getAuthorMatchKeys(contributor)

      if (!contributorSlug || matchKeys.length === 0) {
        continue
      }

      const clusterKey = resolveClusterKey(matchKeys, keyToClusterKey)
      updateAccumulator(accumulators, clusterKey, contributor, work)
      registerMatchKeys(keyToClusterKey, matchKeys, contributorSlug, clusterKey)
    }
  }

  const clusters: AuthorCluster[] = []

  accumulators.forEach((accumulator, clusterKey) => {
    clusters.push(buildCluster(accumulator, clusterKey))
  })

  return clusters
}

async function loadAuthorClusters() {
  if (authorClusterCache && authorClusterCache.expiresAt > Date.now()) {
    return authorClusterCache.clusters
  }

  const works = await listPublishedTheses()
  const clusters = buildAuthorClusters(works)

  authorClusterCache = {
    clusters,
    expiresAt: Date.now() + AUTHOR_CLUSTER_CACHE_TTL_MS,
  }

  return clusters
}

function createSlugLookup(clusters: AuthorCluster[]) {
  const lookup = new Map<string, string>()

  for (const cluster of clusters) {
    lookup.set(cluster.slug, cluster.slug)

    for (const alias of cluster.aliases) {
      const aliasSlug = toAuthorSlug(alias)
      if (aliasSlug) {
        lookup.set(aliasSlug, cluster.slug)
      }
    }

    cluster.matchKeys.forEach((key) => {
      if (key) {
        lookup.set(key, cluster.slug)
      }
    })
  }

  return lookup
}

function buildAuthorSummary(cluster: AuthorCluster): AuthorSummary {
  const latestPublicationLabel = cluster.works[0]?.date ?? 'Unknown date'

  return {
    slug: cluster.slug,
    displayName: cluster.displayName,
    aliases: cluster.aliases,
    workCount: cluster.works.length,
    latestPublicationLabel,
    department: getMostCommon(cluster.works.map((work) => work.department)),
    researchAreas: getTopResearchAreas(cluster.works),
  }
}

export async function listAuthors(query?: string) {
  const clusters = await loadAuthorClusters()
  const normalizedQuery = query?.trim().toLowerCase()
  const normalizedSlugQuery = normalizedQuery ? toAuthorSlug(normalizedQuery) : ''

  let filtered = clusters

  if (normalizedQuery) {
    filtered = clusters.filter((cluster) => {
      if (cluster.displayName.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      if (cluster.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))) {
        return true
      }

      if (!normalizedSlugQuery) {
        return false
      }

      return Array.from(cluster.matchKeys).some((key) => key.includes(normalizedSlugQuery))
    })
  }

  const entries = filtered.map(buildAuthorSummary)

  return entries.sort((a, b) => {
    if (b.workCount !== a.workCount) {
      return b.workCount - a.workCount
    }

    return a.displayName.localeCompare(b.displayName)
  })
}

export async function getAuthorBySlug(authorSlug: string): Promise<AuthorProfile | null> {
  const clusters = await loadAuthorClusters()
  const slugLookup = createSlugLookup(clusters)
  const resolvedSlug = slugLookup.get(authorSlug) || slugLookup.get(toAuthorSlug(authorSlug)) || authorSlug
  const cluster = clusters.find((item) => item.slug === resolvedSlug)

  if (!cluster) {
    return null
  }

  return {
    summary: buildAuthorSummary(cluster),
    works: cluster.works,
  }
}
