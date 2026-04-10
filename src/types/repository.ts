// Database-level codes — mirror the Supabase enum/check-constraint values exactly.
// Used in query builders and DB-layer mapping. For admin UI labels use admin.ts instead.
export type AppRoleCode = 'super-admin' | 'admin' | 'reviewer' | 'faculty-author' | 'student'

export type UserStatusCode = 'active' | 'inactive' | 'pending'

export type OrganizationalUnitTypeCode = 'college' | 'department' | 'office'

export type RepositoryItemTypeCode =
  | 'thesis'
  | 'faculty-research'
  | 'faculty-creative-work'
  | 'policy'
  | 'governance-record'

export type WorkflowStatusCode =
  | 'draft'
  | 'submitted'
  | 'under-review'
  | 'revision-requested'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived'

export type VisibilityCode = 'private' | 'embargoed' | 'campus' | 'public'

export type ContributorKindCode = 'internal-user' | 'external-person' | 'organization'

export type ContributorRoleCode =
  | 'author'
  | 'co-author'
  | 'advisor'
  | 'panel-chair'
  | 'panel-member'
  | 'editor'

export type PolicyRecordCategoryCode =
  | 'repository-policy'
  | 'governance-policy'
  | 'retention-schedule'
  | 'administrative-guideline'

export interface DepartmentCollection {
  id: number
  slug: string
  departmentUnitId: number
  title: string
  description: string | null
  defaultItemTypeCode: RepositoryItemTypeCode | null
  defaultVisibilityCode: VisibilityCode
  isAcceptingSubmissions: boolean
  sortOrder: number
}

export interface Profile {
  id: string
  email: string
  fullName: string
  preferredName: string | null
  roleCode: AppRoleCode
  userStatusCode: UserStatusCode
  primaryUnitId: number | null
  canSubmit: boolean
  canReview: boolean
  isPublicFacultyProfile: boolean
  lastLoginAt: string | null
}

export interface Contributor {
  id: number
  linkedProfileId: string | null
  contributorKindCode: ContributorKindCode
  displayName: string
  sortName: string | null
  email: string | null
  primaryUnitId: number | null
  orcid: string | null
  isActive: boolean
}

export interface RepositoryItemContributor {
  id: number
  repositoryItemId: number
  contributorId: number
  contributorRoleCode: ContributorRoleCode
  displayOrder: number
  isPrimary: boolean
}

export interface RepositoryItemFile {
  id: number
  repositoryItemId: number
  purposeCode: string
  visibilityCode: VisibilityCode
  storageBucket: string
  storageObjectPath: string
  originalFilename: string
  mimeType: string | null
  byteSize: number | null
  checksumSha256: string | null
  uploadedByProfileId: string | null
  isPrimary: boolean
  sortOrder: number
}

export interface RepositoryItem {
  id: number
  publicId: string
  collectionId: number
  owningUnitId: number
  itemTypeCode: RepositoryItemTypeCode
  workflowStatusCode: WorkflowStatusCode
  visibilityCode: VisibilityCode
  slug: string
  title: string
  subtitle: string | null
  abstract: string | null
  degreeName: string | null
  programName: string | null
  languageCode: string | null
  keywords: string[]
  citationText: string | null
  publicationDate: string | null
  defenseDate: string | null
  submittedAt: string | null
  approvedAt: string | null
  publishedAt: string | null
  embargoUntil: string | null
  metadata: Record<string, unknown>
  createdByProfileId: string | null
  updatedByProfileId: string | null
}

export interface RepositoryItemDraft {
  id: number
  ownerProfileId: string
  collectionId: number | null
  itemTypeCode: RepositoryItemTypeCode
  workingTitle: string | null
  lastCompletedStep: number
  payload: Record<string, unknown>
}

export interface PolicyRecordDetails {
  repositoryItemId: number
  policyCategoryCode: PolicyRecordCategoryCode
  issuingUnitId: number | null
  effectiveOn: string | null
  reviewDueOn: string | null
  supersedesRepositoryItemId: number | null
  versionLabel: string | null
  approvalReference: string | null
}

export interface SearchEvent {
  id: number
  actorProfileId: string | null
  queryText: string
  resultCount: number
  filters: Record<string, unknown>
  occurredAt: string
}

export interface DownloadEvent {
  id: number
  repositoryItemId: number
  repositoryItemFileId: number | null
  actorProfileId: string | null
  occurredAt: string
}

export interface PublicCatalogItem {
  publicId: string
  slug: string
  title: string
  itemTypeCode: RepositoryItemTypeCode
  collectionSlug: string
  departmentName: string
  contributors: Array<{
    displayName: string
    roleCode: ContributorRoleCode
    isPrimary: boolean
  }>
  abstract: string | null
  publicationDate: string | null
  keywords: string[]
  visibilityCode: 'public'
}

export interface FacultyAuthorProfileRequirement {
  facultyAuthorsRequireProfiles: true
}

export interface DepartmentOwnedCollectionRequirement {
  collectionsAreDepartmentOwned: true
}