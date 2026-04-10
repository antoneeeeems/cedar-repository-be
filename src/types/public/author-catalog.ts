import type { ThesisEntry } from './thesis-catalog'

export type AuthorSummary = {
  slug: string
  displayName: string
  aliases?: string[]
  workCount: number
  latestPublicationLabel: string
  department: string
  researchAreas: string[]
}

export type AuthorProfile = {
  summary: AuthorSummary
  works: ThesisEntry[]
}
