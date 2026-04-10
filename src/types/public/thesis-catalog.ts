export type RepositoryCategory = 'college-thesis' | 'faculty-work'

export type ThesisCollection = {
  slug: string
  title: string
  count: number
  description: string
  category: RepositoryCategory
}

export type ThesisDetail = {
  publicationDate: string
  documentType: string
  degreeName: string
  subjectCategories: string
  college: string
  departmentUnit: string
  thesisAdvisor: string
  defensePanelChair: string
  defensePanelMembers: string[]
  abstractSummary: string[]
  language: string
  format: string
  keywords: string
  recommendedCitation: string
  embargoPeriod: string
}

export type ThesisEntry = {
  slug: string
  collectionSlug: string
  title: string
  authors: string
  department: string
  date: string
  type: 'Thesis/Dissertation' | 'Faculty Research'
  category: RepositoryCategory
  abstract: string
  tags: string
  detail?: ThesisDetail
  filePath?: string
}
