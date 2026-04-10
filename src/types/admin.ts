// Admin domain types — human-readable labels used across admin UI components,
// forms, and repository interfaces. These are intentionally separate from the
// DB-level codes in repository.ts (which mirror Supabase enum values).
export type SubmissionStatus = 'Draft' | 'Pending Review' | 'Under Review' | 'Approved' | 'Rejected' | 'Revision Requested' | 'Published' | 'Archived'

export type UserRole = 'Super Admin' | 'Admin' | 'Student'
export type UserStatus = 'Active' | 'Inactive' | 'Pending'

export interface AdminStatCard {
  label: string
  value: number
  tone?: 'default' | 'orange' | 'green' | 'red' | 'blue' | 'violet'
}

export interface SubmissionRecord {
  id: string
  title: string
  author: string
  authorEmail?: string
  department: string
  program?: string
  thesisAdvisor?: string
  date: string
  status: SubmissionStatus
  keywords?: string[]
  abstract?: string
  notes?: string
  previewImage?: string
  pageCount?: number
}

export interface SubmissionDraft {
  title: string
  firstName: string
  middleName: string
  lastName: string
  publishedOn: string
  department: string
  documentType: string
  degree: string
  thesisAdvisor: string
  panelChair: string
  panelMembers: string
  keywords: string
  abstract: string
  fileName: string
  fileSize?: number
}

export interface UserRecord {
  id: string
  name: string
  email: string
  role: UserRole
  department: string
  status: UserStatus
  lastLogin: string
  dateAdded?: string
}

export interface PermissionStatement {
  title: string
  intro: string
  bullets: string[]
}

export type SubmissionStepKey = 'basic-info' | 'academic-details' | 'file-upload' | 'verify-details'

export interface SubmissionStepMeta {
  key: SubmissionStepKey
  index: 1 | 2 | 3 | 4
  label: string
  sectionTitle: string
  nextLabel?: string
  nextHref?: string
  backHref?: string
}

export type ReviewActionType = 'approve' | 'revise' | 'reject'

export interface ReviewHistoryItem {
  id: string
  type: 'submitted' | 'approved' | 'revision-requested' | 'rejected'
  by: string
  at: string
  note?: string
}

export interface ReviewActionConfig {
  type: ReviewActionType
  title: string
  confirmLabel: string
  tone: 'green' | 'violet' | 'red'
}

export interface SelectOption {
  label: string
  value: string
}

export type ReportDateRange = '30d' | '90d' | 'ytd' | 'all'

export interface ReportFilters {
  range: ReportDateRange
  department: string
  status: SubmissionStatus | 'all-status'
}

export interface ReportTrendPoint {
  label: string
  submitted: number
  approved: number
  rejected: number
}

export interface ReportStatusBreakdown {
  status: SubmissionStatus
  count: number
  percentage: number
}

export interface DepartmentReportRow {
  department: string
  total: number
  pending: number
  revisions: number
  approved: number
  rejected: number
  approvalRate: number
}

export interface UserGrowthPoint {
  label: string
  newUsers: number
  activeUsers: number
}

export interface UsageSnapshot {
  repositoryViews: number
  uniqueVisitors: number
  searches: number
  downloads: number
}

export interface AuditLogEntry {
  id: string
  at: string
  actor: string
  action: string
  target: string
  details?: string
}

export type AuditOutcome = 'success' | 'failure'

export type AuditEventType =
  | 'submission.created'
  | 'submission.updated'
  | 'submission.reviewed'
  | 'submission.deleted'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'report.exported'
  | 'discovery.search.executed'
  | 'discovery.thesis.viewed'
  | 'discovery.thesis.requested'
  | 'session.login'
  | 'session.logout'

export interface AdminAuditEvent {
  id: string
  occurredAt: string
  actorName: string
  actorRole: UserRole | 'System'
  eventType: AuditEventType
  entityType: 'submission' | 'user' | 'report' | 'session' | 'system' | 'search' | 'thesis'
  entityId: string
  entityLabel: string
  outcome: AuditOutcome
  details?: string
}

export type ReportExportPreset =
  | 'executive-summary'
  | 'submission-pipeline'
  | 'department-performance'
  | 'user-access-usage'
  | 'audit-trail'

export type ReportExportFormat = 'csv' | 'json' | 'pdf' | 'xlsx'

export interface ReportExportPayload {
  fileName: string
  mimeType: string
  content: string
}

export interface ReportSnapshot {
  kpiCards: AdminStatCard[]
  trend: ReportTrendPoint[]
  statusBreakdown: ReportStatusBreakdown[]
  departmentBreakdown: DepartmentReportRow[]
  userGrowth: UserGrowthPoint[]
  usage: UsageSnapshot
  auditLogs: AuditLogEntry[]
}

export interface AdminSession {
  name: string
  email: string
  role: UserRole
  token: string
  refreshToken?: string
  loginAt: string
}

// ---------------------------------------------------------------------------
// Settings types
// ---------------------------------------------------------------------------

export interface RepositorySettings {
  repositoryName: string
  description: string
  contactEmail: string
  contactPhone: string
  institutionName: string
  departmentName: string
}

export interface NotificationPreference {
  enabled: boolean
  template: string
}

export interface NotificationSettings {
  submissionReceived: NotificationPreference
  reviewComplete: NotificationPreference
  revisionRequested: NotificationPreference
  rejectionNotice: NotificationPreference
}

export type RepositoryVisibility = 'public' | 'restricted' | 'private'

export interface AccessSettings {
  defaultUserRole: UserRole
  repositoryVisibility: RepositoryVisibility
  selfRegistration: boolean
  requireApprovalForAccess: boolean
}

export type OaisPreservationLevel = 'bronze' | 'silver' | 'gold'

export interface ComplianceSettings {
  dublinCorePublisher: string
  dublinCoreLanguage: string
  dublinCoreRights: string
  oaisPreservationLevel: OaisPreservationLevel
  enableOaiPmh: boolean
  metadataPrefix: string
}

export interface AuditRetentionSettings {
  logRetentionDays: number
  autoArchiveAfterDays: number
  enablePurge: boolean
  purgeOlderThanDays: number
}

export interface AdminProfileSettings {
  displayName: string
  email: string
}

export type DateFormatOption = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'

export interface AppearanceSettings {
  dateFormat: DateFormatOption
  timezone: string
  itemsPerPage: number
  language: string
}

export interface AllSettings {
  general: RepositorySettings
  notifications: NotificationSettings
  access: AccessSettings
  compliance: ComplianceSettings
  auditRetention: AuditRetentionSettings
  profile: AdminProfileSettings
  appearance: AppearanceSettings
}

export type SettingsSectionKey = keyof AllSettings

// ---------------------------------------------------------------------------
// Scheduled Reports
// ---------------------------------------------------------------------------

export type ScheduledReportFrequency = 'daily' | 'weekly' | 'monthly'

export interface ScheduledReport {
  id: string
  preset: ReportExportPreset
  format: ReportExportFormat
  frequency: ScheduledReportFrequency
  recipientEmail: string
  enabled: boolean
  lastRunAt?: string
}

// ---------------------------------------------------------------------------
// Year-over-Year Comparison
// ---------------------------------------------------------------------------

export interface YearOverYearPeriod {
  label: string
  submissions: number
  approved: number
  rejected: number
}

export interface YearOverYearData {
  currentPeriod: YearOverYearPeriod[]
  previousPeriod: YearOverYearPeriod[]
  currentLabel: string
  previousLabel: string
}
