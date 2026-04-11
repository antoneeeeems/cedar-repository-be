import type {
  AdminAuditEvent,
  AdminStatCard,
  AllSettings,
  CursorConnection,
  ReportFilters,
  ReportDateRange,
  ReportExportFormat,
  ReportExportPayload,
  ReportExportPreset,
  ReportSnapshot,
  ReviewHistoryItem,
  ReviewActionType,
  ScheduledReport,
  SettingsSectionKey,
  SubmissionDraft,
  SubmissionCursorQuery,
  SubmissionRecord,
  SubmissionStatus,
  UserCursorQuery,
  UserRecord,
  YearOverYearData,
} from '@/types/admin'

export type StudentDashboardSnapshot = {
  mySubmissions: SubmissionRecord[]
  statusSummary: { status: SubmissionStatus; count: number }[]
}

export type DashboardMonthlySummary = {
  newSubmissions: number
  growthText: string
}

export type DashboardTodaySummary = {
  newSubmissions: number
  approved: number
  rejected: number
}

export type DashboardSnapshot = {
  kpiCards: AdminStatCard[]
  monthlySummary: DashboardMonthlySummary
  todaySummary: DashboardTodaySummary
}

export type ReportSnapshotWithData = {
  snapshot: ReportSnapshot
  submissions: SubmissionRecord[]
  auditEvents: AdminAuditEvent[]
}

export interface AdminRepository {
  getDashboardSnapshot(): Promise<DashboardSnapshot>
  getReportSnapshot(filters?: Partial<ReportFilters>): Promise<ReportSnapshot>
  getReportSnapshotWithData(filters?: Partial<ReportFilters>): Promise<ReportSnapshotWithData>
  listAuditEvents(filters?: Partial<ReportFilters>): Promise<AdminAuditEvent[]>
  getReportExportPayload(
    preset: ReportExportPreset,
    format: ReportExportFormat,
    filters?: Partial<ReportFilters>
  ): Promise<ReportExportPayload>
  getSubmissionSummaryCards(): Promise<AdminStatCard[]>
  listSubmissions(): Promise<SubmissionRecord[]>
  listSubmissionsCursor(query: SubmissionCursorQuery): Promise<CursorConnection<SubmissionRecord>>
  getSubmissionById(id: string): Promise<SubmissionRecord | undefined>
  getSubmissionReviewHistory(submissionId: string): Promise<ReviewHistoryItem[]>
  getSubmissionDraft(): Promise<SubmissionDraft>
  saveSubmissionDraft(patch: Partial<SubmissionDraft>): Promise<SubmissionDraft>
  clearSubmissionDraft(): Promise<void>
  submitSubmissionDraft(author: { name: string; email: string }): Promise<SubmissionRecord | null>
  reviewSubmission(
    submissionId: string,
    action: ReviewActionType,
    actorName: string,
    payload: { comment?: string; issues?: string[]; adminNotes?: string }
  ): Promise<SubmissionRecord | undefined>
  listUsers(): Promise<UserRecord[]>
  listUsersCursor(query: UserCursorQuery): Promise<CursorConnection<UserRecord>>
  createUser(user: UserRecord): Promise<UserRecord>
  updateUser(userId: string, patch: Partial<UserRecord>): Promise<UserRecord | undefined>
  deleteUser(userId: string): Promise<void>

  // Settings
  getSettings(): Promise<AllSettings>
  updateSettings<K extends SettingsSectionKey>(section: K, patch: Partial<AllSettings[K]>): Promise<AllSettings>

  // Scheduled Reports
  listScheduledReports(): Promise<ScheduledReport[]>
  createScheduledReport(report: Omit<ScheduledReport, 'id'>): Promise<ScheduledReport>
  updateScheduledReport(id: string, patch: Partial<ScheduledReport>): Promise<ScheduledReport | undefined>
  deleteScheduledReport(id: string): Promise<void>

  // Year-over-Year
  getYearOverYearComparison(range: ReportDateRange): Promise<YearOverYearData>

  // Student portal
  listStudentSubmissions(ownerEmail: string): Promise<SubmissionRecord[]>
  getStudentDashboardSnapshot(ownerEmail: string): Promise<StudentDashboardSnapshot>
}