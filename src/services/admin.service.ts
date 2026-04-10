import { randomUUID } from 'node:crypto'

import type {
  AdminAuditEvent,
  AdminStatCard,
  AllSettings,
  ReportExportFormat,
  ReportExportPayload,
  ReportExportPreset,
  ReportFilters,
  ReportSnapshot,
  ReviewActionType,
  ReviewHistoryItem,
  ScheduledReport,
  SettingsSectionKey,
  SubmissionDraft,
  SubmissionRecord,
  UserRecord,
  YearOverYearData,
} from '@/types/admin'
import type { AdminRepository, DashboardSnapshot, ReportSnapshotWithData } from '@/lib/admin/repositories/types'
import { getSupabaseAnonClient, getSupabaseServiceClient } from '@/lib/supabase'

type RepositoryItemRow = {
  id: number
  title: string
  abstract: string | null
  degree_name: string | null
  program_name: string | null
  keywords: string[] | null
  created_at: string | null
  submitted_at: string | null
  workflow_status_code: string
  repository_item_contributors: Array<{
    display_order: number
    contributor_role_code: string
    contributors: { display_name: string } | { display_name: string }[] | null
  }> | null
  organizational_units: {
    name: string
  } | {
    name: string
  }[] | null
}

type ReviewEventRow = {
  id: number
  review_event_type_code: string
  occurred_at: string
  notes: string | null
  actor_profile_id: string | null
  profiles: {
    full_name: string
  } | {
    full_name: string
  }[] | null
}

type DraftRow = {
  id: number
  owner_profile_id: string
  working_title: string | null
  payload: Record<string, unknown> | null
}

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role_code: string | null
  user_status_code: string | null
  last_login_at: string | null
  created_at: string | null
  organizational_units: {
    name: string
  } | {
    name: string
  }[] | null
}

type AuditEventRow = {
  id: number
  occurred_at: string
  actor_label: string | null
  action: string
  entity_type: string
  entity_pk: string
  outcome: string
}

type AdminSettingsRow = {
  section_key: string
  payload: Record<string, unknown> | null
}

type ScheduledReportRow = {
  id: string
  preset: string
  format: string
  frequency: string
  recipient_email: string
  enabled: boolean
  last_run_at: string | null
  created_at: string
}

const schemaName = 'public'
const PROFILE_SELECT_COLUMNS = 'id,email,full_name,role_code,user_status_code,last_login_at,created_at,organizational_units(name)'

export class ApiAdminRepository implements AdminRepository {
  private readonly supabase

  constructor(
    private readonly activeUserId: string | null = null,
    accessToken?: string,
  ) {
    this.supabase = getSupabaseAnonClient(accessToken).schema(schemaName)
  }

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const { snapshot: report } = await this.getReportSnapshotWithData({ range: '30d' })
    const recentTrend = report.trend.at(-1)

    return {
      kpiCards: report.kpiCards,
      monthlySummary: {
        newSubmissions: report.trend.reduce((total, point) => total + point.submitted, 0),
        growthText: `Latest period: ${recentTrend?.submitted ?? 0} submissions`,
      },
      todaySummary: {
        newSubmissions: recentTrend?.submitted ?? 0,
        approved: recentTrend?.approved ?? 0,
        rejected: recentTrend?.rejected ?? 0,
      },
    }
  }

  async getReportSnapshot(filters?: Partial<ReportFilters>): Promise<ReportSnapshot> {
    const { snapshot } = await this.getReportSnapshotWithData(filters)
    return snapshot
  }

  async getReportSnapshotWithData(filters?: Partial<ReportFilters>): Promise<ReportSnapshotWithData> {
    const [submissions, users, auditEvents] = await Promise.all([
      this.listSubmissions(),
      this.listUsers(),
      this.listAuditEvents(),
    ])
    const normalizedFilters = normalizeReportFilters(filters)
    const filteredSubmissions = filterSubmissions(submissions, normalizedFilters)

    const snapshot: ReportSnapshot = {
      kpiCards: [
        { label: 'Submissions', value: filteredSubmissions.length, tone: 'blue' },
        { label: 'Pending', value: countSubmissionsByStatus(filteredSubmissions, 'Pending Review'), tone: 'orange' },
        { label: 'Approved', value: filteredSubmissions.filter((item) => isApprovedLikeStatus(item.status)).length, tone: 'green' },
        { label: 'Rejected', value: countSubmissionsByStatus(filteredSubmissions, 'Rejected'), tone: 'red' },
      ],
      trend: buildTrendPoints(filteredSubmissions),
      statusBreakdown: buildStatusBreakdown(filteredSubmissions),
      departmentBreakdown: buildDepartmentBreakdown(filteredSubmissions),
      userGrowth: buildUserGrowth(users),
      usage: buildUsageSnapshot(filteredSubmissions),
      auditLogs: buildAuditLogs(auditEvents),
    }

    return { snapshot, submissions, auditEvents }
  }

  async listAuditEvents(): Promise<AdminAuditEvent[]> {
    const { data, error } = await this.supabase
      .from('audit_events')
      .select('id,occurred_at,actor_label,action,entity_type,entity_pk,outcome')
      .order('occurred_at', { ascending: false })

    if (error || !data) {
      return []
    }

    return (data as AuditEventRow[]).map((event) => ({
      id: String(event.id),
      occurredAt: event.occurred_at,
      actorName: event.actor_label ?? 'System',
      actorRole: 'System',
      eventType: toAuditEventType(event.action),
      entityType: toAuditEntityType(event.entity_type),
      entityId: event.entity_pk,
      entityLabel: event.entity_pk,
      outcome: event.outcome === 'success' ? 'success' : 'failure',
      details: undefined,
    }))
  }

  async getReportExportPayload(
    preset: ReportExportPreset,
    format: ReportExportFormat,
    filters?: Partial<ReportFilters>,
  ): Promise<ReportExportPayload> {
    const snapshot = await this.getReportSnapshot(filters)
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(/[T:]/g, '-')
    const fileName = `cedar-${preset}-${stamp}.${format}`

    if (format === 'json') {
      return {
        fileName,
        mimeType: 'application/json',
        content: JSON.stringify(snapshot, null, 2),
      }
    }

    const rows = [
      ['metric', 'value'],
      ...snapshot.kpiCards.map((card) => [card.label, String(card.value)]),
    ]

    return {
      fileName,
      mimeType: 'text/csv;charset=utf-8',
      content: rows.map((row) => row.map(csvCell).join(',')).join('\n'),
    }
  }

  async getSubmissionSummaryCards(): Promise<AdminStatCard[]> {
    const submissions = await this.listSubmissions()
    return [
      { label: 'Total', value: submissions.length, tone: 'default' },
      { label: 'Pending', value: countSubmissionsByStatus(submissions, 'Pending Review'), tone: 'orange' },
      { label: 'Revisions', value: countSubmissionsByStatus(submissions, 'Revision Requested'), tone: 'violet' },
      { label: 'Approved', value: submissions.filter((item) => isApprovedLikeStatus(item.status)).length, tone: 'green' },
      { label: 'Rejected', value: countSubmissionsByStatus(submissions, 'Rejected'), tone: 'red' },
    ]
  }

  async listSubmissions(): Promise<SubmissionRecord[]> {
    const { data, error } = await this.supabase
      .from('repository_items')
      .select('id,title,abstract,degree_name,program_name,keywords,created_at,submitted_at,workflow_status_code,repository_item_contributors(display_order,contributor_role_code,contributors(display_name)),organizational_units(name)')
      .eq('item_type_code', 'thesis')
      .order('created_at', { ascending: false })

    if (error || !data) {
      return []
    }

    return (data as RepositoryItemRow[]).map(mapSubmission)
  }

  async listStudentSubmissions(_ownerEmail: string): Promise<SubmissionRecord[]> {
    const userId = await this.getActiveUserId()
    if (!userId) return []

    const { data, error } = await this.supabase
      .from('repository_items')
      .select('id,title,abstract,degree_name,program_name,keywords,created_at,submitted_at,workflow_status_code,repository_item_contributors(display_order,contributor_role_code,contributors(display_name)),organizational_units(name)')
      .eq('item_type_code', 'thesis')
      .eq('created_by_profile_id', userId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return (data as RepositoryItemRow[]).map(mapSubmission)
  }

  async getStudentDashboardSnapshot(ownerEmail: string): Promise<import('@/lib/admin/repositories/types').StudentDashboardSnapshot> {
    const mySubmissions = await this.listStudentSubmissions(ownerEmail)
    const statusCounts = new Map<string, number>()
    for (const s of mySubmissions) {
      statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1)
    }
    const statusSummary = Array.from(statusCounts.entries()).map(([status, count]) => ({
      status: status as import('@/types/admin').SubmissionStatus,
      count,
    }))
    return { mySubmissions, statusSummary }
  }

  async getSubmissionById(id: string): Promise<SubmissionRecord | undefined> {
    const { data, error } = await this.supabase
      .from('repository_items')
      .select('id,title,abstract,degree_name,program_name,keywords,created_at,submitted_at,workflow_status_code,repository_item_contributors(display_order,contributor_role_code,contributors(display_name)),organizational_units(name)')
      .eq('id', Number(id))
      .maybeSingle()

    if (error || !data) {
      return undefined
    }

    return mapSubmission(data as RepositoryItemRow)
  }

  async getSubmissionReviewHistory(submissionId: string): Promise<ReviewHistoryItem[]> {
    const { data, error } = await this.supabase
      .from('review_events')
      .select('id,review_event_type_code,occurred_at,notes,actor_profile_id,profiles(full_name)')
      .eq('repository_item_id', Number(submissionId))
      .order('occurred_at', { ascending: false })

    if (error || !data) {
      return []
    }

    return (data as ReviewEventRow[]).map((item) => ({
      id: String(item.id),
      type: toReviewHistoryType(item.review_event_type_code),
      by: extractProfileName(item.profiles) ?? 'Admin',
      at: new Date(item.occurred_at).toLocaleString('en-US'),
      note: item.notes ?? undefined,
    }))
  }

  async getSubmissionDraft(): Promise<SubmissionDraft> {
    const userId = await this.getActiveUserId()
    if (!userId) {
      return defaultSubmissionDraft()
    }

    const { data } = await this.supabase
      .from('repository_item_drafts')
      .select('id,owner_profile_id,working_title,payload')
      .eq('owner_profile_id', userId)
      .maybeSingle()

    if (!data) {
      return defaultSubmissionDraft()
    }

    const draftRow = data as DraftRow
    return mapDraftPayloadToSubmissionDraft(draftRow.payload)
  }

  async saveSubmissionDraft(patch: Partial<SubmissionDraft>): Promise<SubmissionDraft> {
    const current = await this.getSubmissionDraft()
    const next = { ...current, ...patch }
    const userId = await this.getActiveUserId()

    if (!userId) {
      return next
    }

    const { data } = await this.supabase
      .from('repository_item_drafts')
      .upsert({
        owner_profile_id: userId,
        item_type_code: 'thesis',
        working_title: next.title || null,
        payload: next,
      }, { onConflict: 'owner_profile_id,item_type_code' })
      .select('id,owner_profile_id,working_title,payload')
      .maybeSingle()

    return data ? mapDraftPayloadToSubmissionDraft((data as DraftRow).payload) : next
  }

  async clearSubmissionDraft(): Promise<void> {
    const userId = await this.getActiveUserId()
    if (userId) {
      await this.supabase.from('repository_item_drafts').delete().eq('owner_profile_id', userId)
    }
  }

  async submitSubmissionDraft(author: { name: string; email: string }): Promise<SubmissionRecord | null> {
    const draft = await this.getSubmissionDraft()
    if (!draft.title.trim()) {
      return null
    }

    const userId = await this.getActiveUserId()
    if (!userId) {
      throw new Error('Authenticated profile is required to submit a thesis draft.')
    }

    const collectionId = await this.resolveDepartmentCollectionId(draft.department)
    const unitId = await this.resolveDepartmentUnitId(draft.department)
    const authors = [draft.firstName.trim(), draft.middleName.trim(), draft.lastName.trim()].filter(Boolean).join(' ') || author.name
    const slug = slugify(draft.title)
    const publicationDate = toIsoDate(draft.publishedOn)

    const { data, error } = await this.supabase
      .from('repository_items')
      .insert({
        collection_id: collectionId,
        owning_unit_id: unitId,
        item_type_code: 'thesis',
        workflow_status_code: 'submitted',
        visibility_code: 'private',
        slug,
        title: draft.title,
        abstract: draft.abstract || null,
        degree_name: draft.degree || null,
        program_name: draft.degree || null,
        keywords: splitCommaField(draft.keywords),
        publication_date: publicationDate,
        submitted_at: new Date().toISOString(),
        created_by_profile_id: userId,
        updated_by_profile_id: userId,
        metadata: {
          thesisAdvisor: draft.thesisAdvisor || null,
          panelChair: draft.panelChair || null,
          panelMembers: splitCommaField(draft.panelMembers),
          originalFileName: draft.fileName || null,
        },
      })
      .select('id,title,abstract,degree_name,program_name,keywords,created_at,submitted_at,workflow_status_code,repository_item_contributors(display_order,contributor_role_code,contributors(display_name)),organizational_units(name)')
      .maybeSingle()

    if (error || !data) {
      throw new Error(`Failed to submit repository draft: ${error?.message ?? 'insert operation returned no record'}`)
    }

    const repositoryItemId = (data as RepositoryItemRow).id
    const contributorId = await this.ensureContributorForProfile(userId, authors, author.email, unitId)

    await this.supabase.from('repository_item_contributors').insert({
      repository_item_id: repositoryItemId,
      contributor_id: contributorId,
      contributor_role_code: 'author',
      display_order: 1,
      is_primary: true,
    })

    await Promise.all([
      this.supabase.from('review_events').insert({
        repository_item_id: repositoryItemId,
        actor_profile_id: userId,
        review_event_type_code: 'submitted',
        from_status_code: null,
        to_status_code: 'submitted',
        notes: 'Submission created',
      }),
      this.supabase.from('audit_events').insert({
        actor_profile_id: userId,
        actor_label: author.name,
        action: 'submission.created',
        entity_type: 'repository_item',
        entity_pk: String(repositoryItemId),
        outcome: 'success',
        details: { item_type_code: 'thesis' },
      }),
    ])

    await this.clearSubmissionDraft()

    return mapSubmission({
      ...(data as RepositoryItemRow),
      repository_item_contributors: [{
        display_order: 1,
        contributor_role_code: 'author',
        contributors: { display_name: authors },
      }],
    })
  }

  async reviewSubmission(
    submissionId: string,
    action: ReviewActionType,
    actorName: string,
    payload: { comment?: string; issues?: string[]; adminNotes?: string },
  ): Promise<SubmissionRecord | undefined> {
    const userId = await this.getActiveUserId()
    const numericId = Number(submissionId)
    const nextStatus = reviewActionToStatus(action)

    // Fetch current status for from_status_code audit trail
    const { data: currentItem } = await this.supabase
      .from('repository_items')
      .select('workflow_status_code')
      .eq('id', numericId)
      .maybeSingle()

    const fromStatus = (currentItem as { workflow_status_code: string } | null)?.workflow_status_code ?? null

    const now = new Date().toISOString()
    const { data, error } = await this.supabase
      .from('repository_items')
      .update({
        workflow_status_code: nextStatus,
        visibility_code: nextStatus === 'approved' ? 'campus' : 'private',
        approved_at: nextStatus === 'approved' ? now : undefined,
        updated_by_profile_id: userId,
      })
      .eq('id', numericId)
      .select('id,title,abstract,degree_name,program_name,keywords,created_at,submitted_at,workflow_status_code,repository_item_contributors(display_order,contributor_role_code,contributors(display_name)),organizational_units(name)')
      .maybeSingle()

    if (error || !data) {
      throw new Error(`Failed to update repository submission status: ${error?.message ?? 'update operation returned no record'}`)
    }

    const reviewNotes = [payload.comment, payload.issues?.length ? `Issues: ${payload.issues.join(', ')}` : undefined, payload.adminNotes].filter(Boolean).join(' | ') || null

    await Promise.all([
      this.supabase.from('review_events').insert({
        repository_item_id: numericId,
        actor_profile_id: userId,
        review_event_type_code: reviewActionToReviewEventType(action),
        from_status_code: fromStatus,
        to_status_code: nextStatus,
        notes: reviewNotes,
      }),
      this.supabase.from('audit_events').insert({
        actor_profile_id: userId,
        actor_label: actorName,
        action: 'submission.reviewed',
        entity_type: 'repository_item',
        entity_pk: submissionId,
        outcome: 'success',
        details: { action, fromStatus, nextStatus },
      }),
    ])

    return mapSubmission(data as RepositoryItemRow)
  }

  async listUsers(): Promise<UserRecord[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(PROFILE_SELECT_COLUMNS)
      .order('created_at', { ascending: false })

    if (error || !data) {
      return []
    }

    return (data as ProfileRow[]).map(mapProfileToUserRecord)
  }

  async createUser(user: UserRecord): Promise<UserRecord> {
    const serviceClient = getSupabaseServiceClient()
    const normalizedEmail = user.email.trim().toLowerCase()
    const normalizedName = user.name.trim()

    if (!normalizedEmail || !normalizedName) {
      throw new Error('User name and email are required.')
    }

    const generatedPassword = `Cedar!${randomUUID()}Aa1`
    const { data: createdUserData, error: createUserError } = await serviceClient.auth.admin.createUser({
      email: normalizedEmail,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: normalizedName,
      },
    })

    if (createUserError || !createdUserData.user?.id) {
      throw new Error(`Failed to create user account: ${createUserError?.message ?? 'unknown error'}`)
    }

    const nextRoleCode = mapUserRoleToRoleCode(user.role)
    const nextStatusCode = mapUserStatusToCode(user.status)
    const profileClient = serviceClient.schema(schemaName)
    const { data: profileData, error: profileError } = await profileClient
      .from('profiles')
      .upsert(
        {
          id: createdUserData.user.id,
          email: normalizedEmail,
          full_name: normalizedName,
          role_code: nextRoleCode,
          user_status_code: nextStatusCode,
        },
        { onConflict: 'id' },
      )
      .select(PROFILE_SELECT_COLUMNS)
      .maybeSingle()

    if (profileError || !profileData) {
      await serviceClient.auth.admin.deleteUser(createdUserData.user.id)
      throw new Error(`Failed to persist user profile: ${profileError?.message ?? 'unknown error'}`)
    }

    await profileClient
      .from('audit_events')
      .insert({
        actor_profile_id: this.activeUserId,
        actor_label: 'CEDAR Admin',
        action: 'user.created',
        entity_type: 'user',
        entity_pk: createdUserData.user.id,
        outcome: 'success',
      })

    return mapProfileToUserRecord(profileData as ProfileRow)
  }

  async updateUser(userId: string, patch: Partial<UserRecord>): Promise<UserRecord | undefined> {
    const serviceClient = getSupabaseServiceClient()
    const profileClient = serviceClient.schema(schemaName)
    const profilePatch: Record<string, unknown> = {}

    if (patch.name !== undefined) {
      profilePatch.full_name = patch.name.trim()
    }

    if (patch.email !== undefined) {
      const nextEmail = patch.email.trim().toLowerCase()
      profilePatch.email = nextEmail

      const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(userId, {
        email: nextEmail,
      })

      if (updateAuthError) {
        throw new Error(`Failed to update auth user email: ${updateAuthError.message}`)
      }
    }

    if (patch.role !== undefined) {
      profilePatch.role_code = mapUserRoleToRoleCode(patch.role)
    }

    if (patch.status !== undefined) {
      profilePatch.user_status_code = mapUserStatusToCode(patch.status)
    }

    let profileData: ProfileRow | null = null

    if (Object.keys(profilePatch).length > 0) {
      const { data, error } = await profileClient
        .from('profiles')
        .update(profilePatch)
        .eq('id', userId)
        .select(PROFILE_SELECT_COLUMNS)
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to update user profile: ${error.message}`)
      }

      profileData = (data as ProfileRow | null) ?? null
    } else {
      const { data, error } = await profileClient
        .from('profiles')
        .select(PROFILE_SELECT_COLUMNS)
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to load user profile: ${error.message}`)
      }

      profileData = (data as ProfileRow | null) ?? null
    }

    if (!profileData) {
      return undefined
    }

    await profileClient
      .from('audit_events')
      .insert({
        actor_profile_id: this.activeUserId,
        actor_label: 'CEDAR Admin',
        action: 'user.updated',
        entity_type: 'user',
        entity_pk: userId,
        outcome: 'success',
      })

    return mapProfileToUserRecord(profileData)
  }

  async deleteUser(userId: string): Promise<void> {
    const serviceClient = getSupabaseServiceClient()
    const profileClient = serviceClient.schema(schemaName)

    const { error: profileDeleteError } = await profileClient
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileDeleteError) {
      throw new Error(`Failed to delete user profile: ${profileDeleteError.message}`)
    }

    const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      throw new Error(`Failed to delete auth user: ${authDeleteError.message}`)
    }

    await profileClient
      .from('audit_events')
      .insert({
        actor_profile_id: this.activeUserId,
        actor_label: 'CEDAR Admin',
        action: 'user.deleted',
        entity_type: 'user',
        entity_pk: userId,
        outcome: 'success',
      })
  }

  async getSettings(): Promise<AllSettings> {
    const defaults = apiDefaultSettings()
    const { data, error } = await this.supabase
      .from('admin_settings')
      .select('section_key,payload')

    if (error || !data) {
      return defaults
    }

    return mergeSettingsRows(defaults, data as AdminSettingsRow[])
  }

  async updateSettings<K extends SettingsSectionKey>(section: K, patch: Partial<AllSettings[K]>): Promise<AllSettings> {
    const current = await this.getSettings()
    const updated: AllSettings = {
      ...current,
      [section]: { ...current[section], ...patch },
    }

    const userId = await this.getActiveUserId()
    const payload = toSettingsPayload(updated[section])

    await this.supabase
      .from('admin_settings')
      .upsert(
        {
          section_key: section,
          payload,
          updated_by_profile_id: userId,
        },
        { onConflict: 'section_key' },
      )

    return updated
  }

  async listScheduledReports(): Promise<ScheduledReport[]> {
    const { data, error } = await this.supabase
      .from('scheduled_reports')
      .select('id,preset,format,frequency,recipient_email,enabled,last_run_at,created_at')
      .order('created_at', { ascending: false })

    if (error || !data) {
      return []
    }

    return (data as ScheduledReportRow[]).map(mapScheduledReportRow)
  }

  async createScheduledReport(report: Omit<ScheduledReport, 'id'>): Promise<ScheduledReport> {
    const userId = await this.getActiveUserId()
    const { data, error } = await this.supabase
      .from('scheduled_reports')
      .insert({
        preset: report.preset,
        format: report.format,
        frequency: report.frequency,
        recipient_email: report.recipientEmail,
        enabled: report.enabled,
        last_run_at: report.lastRunAt ?? null,
        created_by_profile_id: userId,
        updated_by_profile_id: userId,
      })
      .select('id,preset,format,frequency,recipient_email,enabled,last_run_at,created_at')
      .maybeSingle()

    if (error || !data) {
      throw new Error(`Failed to create scheduled report: ${error?.message ?? 'insert operation returned no record'}`)
    }

    return mapScheduledReportRow(data as ScheduledReportRow)
  }

  async updateScheduledReport(id: string, patch: Partial<ScheduledReport>): Promise<ScheduledReport | undefined> {
    const userId = await this.getActiveUserId()
    const updatePayload: Record<string, unknown> = {}

    if (patch.preset !== undefined) updatePayload.preset = patch.preset
    if (patch.format !== undefined) updatePayload.format = patch.format
    if (patch.frequency !== undefined) updatePayload.frequency = patch.frequency
    if (patch.recipientEmail !== undefined) updatePayload.recipient_email = patch.recipientEmail
    if (patch.enabled !== undefined) updatePayload.enabled = patch.enabled
    if (patch.lastRunAt !== undefined) updatePayload.last_run_at = patch.lastRunAt
    updatePayload.updated_by_profile_id = userId

    const { data, error } = await this.supabase
      .from('scheduled_reports')
      .update(updatePayload)
      .eq('id', id)
      .select('id,preset,format,frequency,recipient_email,enabled,last_run_at,created_at')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update scheduled report ${id}: ${error.message}`)
    }

    return data ? mapScheduledReportRow(data as ScheduledReportRow) : undefined
  }

  async deleteScheduledReport(id: string): Promise<void> {
    const { error } = await this.supabase.from('scheduled_reports').delete().eq('id', id)
    if (error) {
      throw new Error(`Failed to delete scheduled report ${id}: ${error.message}`)
    }
  }

  async getYearOverYearComparison(): Promise<YearOverYearData> {
    const submissions = await this.listSubmissions()
    const makePeriod = () =>
      Array.from({ length: 6 }).map((_, index) => ({
        label: `W${index + 1}`,
        submissions: Math.max(0, Math.floor(submissions.length / 6)) + (index < submissions.length % 6 ? 1 : 0),
        approved: Math.floor(submissions.filter((item) => isApprovedLikeStatus(item.status)).length / 6),
        rejected: Math.floor(submissions.filter((item) => item.status === 'Rejected').length / 6),
      }))

    return {
      currentPeriod: makePeriod(),
      previousPeriod: makePeriod(),
      currentLabel: 'Current Period',
      previousLabel: 'Previous Period',
    }
  }

  private async getActiveUserId() {
    return this.activeUserId
  }

  private async resolveDepartmentUnitId(departmentName: string) {
    const normalized = normalizeLookupValue(departmentName)
    const { data, error } = await this.supabase
      .from('organizational_units')
      .select('id,name')
      .eq('unit_type_code', 'department')

    if (error || !data) {
      throw new Error(`Failed to load repository departments: ${error?.message ?? 'unknown error'}`)
    }

    const match = data.find((unit) => normalizeLookupValue(String(unit.name ?? '')) === normalized)
    if (!match) {
      throw new Error(`No department unit mapping found for: ${departmentName}`)
    }

    return Number(match.id)
  }

  private async resolveDepartmentCollectionId(departmentName: string) {
    const departmentUnitId = await this.resolveDepartmentUnitId(departmentName)
    const { data, error } = await this.supabase
      .from('collections')
      .select('id')
      .eq('department_unit_id', departmentUnitId)
      .eq('default_item_type_code', 'thesis')
      .maybeSingle()

    if (error || !data) {
      throw new Error(`No thesis collection mapping found for department: ${departmentName}`)
    }

    return Number(data.id)
  }

  private async ensureContributorForProfile(profileId: string, displayName: string, email: string, primaryUnitId: number) {
    const { data: existing } = await this.supabase
      .from('contributors')
      .select('id')
      .eq('linked_profile_id', profileId)
      .maybeSingle()

    if (existing?.id) {
      return Number(existing.id)
    }

    const { data, error } = await this.supabase
      .from('contributors')
      .insert({
        linked_profile_id: profileId,
        contributor_kind_code: 'internal-user',
        display_name: displayName,
        email,
        primary_unit_id: primaryUnitId,
      })
      .select('id')
      .maybeSingle()

    if (error || !data) {
      throw new Error(`Failed to create contributor for profile ${profileId}: ${error?.message ?? 'unknown error'}`)
    }

    return Number(data.id)
  }
}

function mapSubmission(row: RepositoryItemRow): SubmissionRecord {
  const contributorLinks = row.repository_item_contributors ?? []
  const authors = contributorLinks
    .filter((link) => link.contributor_role_code === 'author' || link.contributor_role_code === 'co-author')
    .sort((left, right) => left.display_order - right.display_order)
    .map((link) => extractContributorName(link.contributors))
    .filter(Boolean)
    .join('; ')

  return {
    id: String(row.id),
    title: row.title,
    author: authors || 'Unknown Author',
    department: extractUnitName(row.organizational_units) ?? 'Unknown Department',
    program: row.program_name ?? undefined,
    thesisAdvisor: extractAdvisorName(contributorLinks),
    date: formatSubmissionDate(row.submitted_at ?? row.created_at),
    status: mapWorkflowStatusToSubmissionStatus(row.workflow_status_code),
    keywords: row.keywords ?? [],
    abstract: row.abstract ?? undefined,
  }
}

function mapDraftPayloadToSubmissionDraft(payload: Record<string, unknown> | null | undefined): SubmissionDraft {
  return {
    title: typeof payload?.title === 'string' ? payload.title : '',
    firstName: typeof payload?.firstName === 'string' ? payload.firstName : '',
    middleName: typeof payload?.middleName === 'string' ? payload.middleName : '',
    lastName: typeof payload?.lastName === 'string' ? payload.lastName : '',
    publishedOn: typeof payload?.publishedOn === 'string' ? payload.publishedOn : '',
    department: typeof payload?.department === 'string' ? payload.department : '',
    documentType: typeof payload?.documentType === 'string' ? payload.documentType : '',
    degree: typeof payload?.degree === 'string' ? payload.degree : '',
    thesisAdvisor: typeof payload?.thesisAdvisor === 'string' ? payload.thesisAdvisor : '',
    panelChair: typeof payload?.panelChair === 'string' ? payload.panelChair : '',
    panelMembers: typeof payload?.panelMembers === 'string' ? payload.panelMembers : '',
    keywords: typeof payload?.keywords === 'string' ? payload.keywords : '',
    abstract: typeof payload?.abstract === 'string' ? payload.abstract : '',
    fileName: typeof payload?.fileName === 'string' ? payload.fileName : '',
    fileSize: typeof payload?.fileSize === 'number' ? payload.fileSize : undefined,
  }
}

function mapWorkflowStatusToSubmissionStatus(status: string): SubmissionRecord['status'] {
  if (status === 'draft') return 'Draft'
  if (status === 'submitted') return 'Pending Review'
  if (status === 'under-review') return 'Under Review'
  if (status === 'revision-requested') return 'Revision Requested'
  if (status === 'approved') return 'Approved'
  if (status === 'published') return 'Published'
  if (status === 'rejected') return 'Rejected'
  if (status === 'archived') return 'Archived'
  return 'Pending Review'
}

function mapRoleCodeToUserRole(roleCode: string | null | undefined): UserRecord['role'] {
  if (roleCode === 'super-admin') return 'Super Admin'
  if (roleCode === 'admin') return 'Admin'
  return 'Student'
}

function mapUserRoleToRoleCode(role: UserRecord['role']) {
  if (role === 'Super Admin') return 'super-admin'
  if (role === 'Admin') return 'admin'
  return 'student'
}

function mapUserStatusCode(statusCode: string | null | undefined): UserRecord['status'] {
  if (statusCode === 'inactive') return 'Inactive'
  if (statusCode === 'pending') return 'Pending'
  return 'Active'
}

function mapUserStatusToCode(status: UserRecord['status']) {
  if (status === 'Inactive') return 'inactive'
  if (status === 'Pending') return 'pending'
  return 'active'
}

function mapProfileToUserRecord(profile: ProfileRow): UserRecord {
  return {
    id: profile.id,
    name: profile.full_name ?? 'Unknown User',
    email: profile.email ?? '',
    role: mapRoleCodeToUserRole(profile.role_code),
    department: extractUnitName(profile.organizational_units) ?? 'Repository Office',
    status: mapUserStatusCode(profile.user_status_code),
    lastLogin: profile.last_login_at ? new Date(profile.last_login_at).toLocaleDateString('en-US') : 'Never',
    dateAdded: profile.created_at
      ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : undefined,
  }
}

function reviewActionToStatus(action: ReviewActionType) {
  if (action === 'approve') return 'approved'
  if (action === 'revise') return 'revision-requested'
  return 'rejected'
}

function reviewActionToReviewEventType(action: ReviewActionType) {
  const actionToEventType: Record<ReviewActionType, string> = {
    approve: 'approved',
    revise: 'revision-requested',
    reject: 'rejected',
  }

  return actionToEventType[action]
}

function toReviewHistoryType(eventTypeCode: string): ReviewHistoryItem['type'] {
  if (eventTypeCode === 'approved' || eventTypeCode === 'published') return 'approved'
  if (eventTypeCode === 'revision-requested') return 'revision-requested'
  if (eventTypeCode === 'rejected') return 'rejected'
  return 'submitted'
}

function toAuditEventType(action: string): AdminAuditEvent['eventType'] {
  if (action === 'submission.created') return 'submission.created'
  if (action === 'submission.reviewed') return 'submission.reviewed'
  if (action === 'user.created') return 'user.created'
  if (action === 'user.updated') return 'user.updated'
  if (action === 'user.deleted') return 'user.deleted'
  if (action === 'report.exported') return 'report.exported'
  if (action === 'discovery.search.executed') return 'discovery.search.executed'
  if (action === 'discovery.thesis.viewed') return 'discovery.thesis.viewed'
  if (action === 'discovery.thesis.requested') return 'discovery.thesis.requested'
  if (action === 'session.login') return 'session.login'
  if (action === 'session.logout') return 'session.logout'
  return 'submission.updated'
}

function toAuditEntityType(entityType: string): AdminAuditEvent['entityType'] {
  if (entityType === 'user') return 'user'
  if (entityType === 'report') return 'report'
  if (entityType === 'session') return 'session'
  if (entityType === 'search') return 'search'
  if (entityType === 'thesis') return 'thesis'
  if (entityType === 'system') return 'system'
  return 'submission'
}

function extractContributorName(value: { display_name: string } | { display_name: string }[] | null | undefined) {
  if (Array.isArray(value)) return value[0]?.display_name ?? ''
  return value?.display_name ?? ''
}

function extractProfileName(value: { full_name: string } | { full_name: string }[] | null | undefined) {
  if (Array.isArray(value)) return value[0]?.full_name ?? ''
  return value?.full_name ?? ''
}

function extractUnitName(value: { name: string } | { name: string }[] | null | undefined) {
  if (Array.isArray(value)) return value[0]?.name ?? ''
  return value?.name ?? ''
}

function extractAdvisorName(links: RepositoryItemRow['repository_item_contributors']) {
  const advisor = (links ?? []).find((link) => link.contributor_role_code === 'advisor')
  return advisor ? extractContributorName(advisor.contributors) || undefined : undefined
}

function formatSubmissionDate(dateString: string | null | undefined) {
  if (!dateString) return 'Unknown date'
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime())) return dateString
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeReportFilters(filters?: Partial<ReportFilters>): ReportFilters {
  return {
    range: filters?.range ?? '30d',
    department: filters?.department ?? 'all-departments',
    status: filters?.status ?? 'all-status',
  }
}

function filterSubmissions(submissions: SubmissionRecord[], filters: ReportFilters) {
  return submissions.filter((submission) => {
    const matchesDepartment = filters.department === 'all-departments' || submission.department === filters.department
    const matchesStatus = filters.status === 'all-status' || submission.status === filters.status
    return matchesDepartment && matchesStatus
  })
}

function isApprovedLikeStatus(status: SubmissionRecord['status']) {
  return status === 'Approved' || status === 'Published'
}

function countSubmissionsByStatus(submissions: SubmissionRecord[], status: SubmissionRecord['status']) {
  return submissions.filter((submission) => submission.status === status).length
}

function buildTrendPoints(submissions: SubmissionRecord[]) {
  const buckets = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((label) => ({ label, submitted: 0, approved: 0, rejected: 0 }))
  submissions.forEach((submission, index) => {
    const bucket = buckets[index % buckets.length]
    bucket.submitted += 1
    if (isApprovedLikeStatus(submission.status)) bucket.approved += 1
    if (submission.status === 'Rejected') bucket.rejected += 1
  })
  return buckets
}

function buildStatusBreakdown(submissions: SubmissionRecord[]) {
  const total = Math.max(1, submissions.length)
  const statuses: SubmissionRecord['status'][] = ['Draft', 'Pending Review', 'Under Review', 'Revision Requested', 'Approved', 'Published', 'Rejected', 'Archived']
  return statuses.map((status) => {
    const count = submissions.filter((submission) => submission.status === status).length
    return { status, count, percentage: Math.round((count / total) * 100) }
  })
}

function buildDepartmentBreakdown(submissions: SubmissionRecord[]) {
  const departments = Array.from(new Set(submissions.map((submission) => submission.department)))
  return departments.map((department) => {
    const departmentItems = submissions.filter((submission) => submission.department === department)
    const total = departmentItems.length
    const approved = departmentItems.filter((submission) => isApprovedLikeStatus(submission.status)).length
    const rejected = departmentItems.filter((submission) => submission.status === 'Rejected').length
    const revisions = departmentItems.filter((submission) => submission.status === 'Revision Requested').length
    const pending = departmentItems.filter((submission) => submission.status === 'Pending Review').length
    return {
      department,
      total,
      pending,
      revisions,
      approved,
      rejected,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    }
  })
}

function buildUserGrowth(users: UserRecord[]) {
  const activeUsers = users.filter((item) => item.status === 'Active').length
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((label, index) => ({
    label,
    newUsers: Math.max(0, Math.round(users.length / 6) + (index % 2)),
    activeUsers,
  }))
}

function buildUsageSnapshot(submissions: SubmissionRecord[]) {
  const base = submissions.length
  return {
    repositoryViews: base * 18,
    uniqueVisitors: base * 9,
    searches: base * 7,
    downloads: base * 5,
  }
}

function buildAuditLogs(events: AdminAuditEvent[]) {
  return events.slice(0, 30).map((event) => ({
    id: event.id,
    at: new Date(event.occurredAt).toLocaleString('en-US'),
    actor: event.actorName,
    action: event.eventType,
    target: event.entityLabel,
    details: event.details,
  }))
}

function splitCommaField(value: string) {
  return value.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean)
}

function toIsoDate(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) return null
  const parsedDate = new Date(trimmedValue)
  if (Number.isNaN(parsedDate.getTime())) return null
  return parsedDate.toISOString().slice(0, 10)
}

function slugify(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '').slice(0, 80)
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replaceAll(/\s+/g, ' ')
}

function mapScheduledReportRow(row: ScheduledReportRow): ScheduledReport {
  return {
    id: row.id,
    preset: isReportPreset(row.preset) ? row.preset : 'submission-pipeline',
    format: isReportExportFormat(row.format) ? row.format : 'csv',
    frequency: isScheduledFrequency(row.frequency) ? row.frequency : 'weekly',
    recipientEmail: row.recipient_email,
    enabled: row.enabled,
    lastRunAt: row.last_run_at ?? undefined,
  }
}

function mergeSettingsRows(defaults: AllSettings, rows: AdminSettingsRow[]): AllSettings {
  const next: AllSettings = {
    ...defaults,
    general: { ...defaults.general },
    notifications: { ...defaults.notifications },
    access: { ...defaults.access },
    compliance: { ...defaults.compliance },
    auditRetention: { ...defaults.auditRetention },
    profile: { ...defaults.profile },
    appearance: { ...defaults.appearance },
  }

  rows.forEach((row) => {
    if (!isSettingsSectionKey(row.section_key) || !isRecord(row.payload)) {
      return
    }

    applySettingsSectionPayload(next, row.section_key, row.payload)
  })

  return next
}

function toSettingsPayload(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }

  return {}
}

function applySettingsSectionPayload(
  settings: AllSettings,
  sectionKey: SettingsSectionKey,
  payload: Record<string, unknown>,
) {
  switch (sectionKey) {
    case 'general':
      settings.general = { ...settings.general, ...payload }
      break
    case 'notifications':
      settings.notifications = { ...settings.notifications, ...payload }
      break
    case 'access':
      settings.access = { ...settings.access, ...payload }
      break
    case 'compliance':
      settings.compliance = { ...settings.compliance, ...payload }
      break
    case 'auditRetention':
      settings.auditRetention = { ...settings.auditRetention, ...payload }
      break
    case 'profile':
      settings.profile = { ...settings.profile, ...payload }
      break
    case 'appearance':
      settings.appearance = { ...settings.appearance, ...payload }
      break
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSettingsSectionKey(value: string): value is SettingsSectionKey {
  return (
    value === 'general' ||
    value === 'notifications' ||
    value === 'access' ||
    value === 'compliance' ||
    value === 'auditRetention' ||
    value === 'profile' ||
    value === 'appearance'
  )
}

function isScheduledFrequency(value: string): value is ScheduledReport['frequency'] {
  return value === 'daily' || value === 'weekly' || value === 'monthly'
}

function isReportPreset(value: string): value is ReportExportPreset {
  return (
    value === 'executive-summary' ||
    value === 'submission-pipeline' ||
    value === 'department-performance' ||
    value === 'user-access-usage' ||
    value === 'audit-trail'
  )
}

function isReportExportFormat(value: string): value is ScheduledReport['format'] {
  return value === 'csv' || value === 'json' || value === 'pdf' || value === 'xlsx'
}

function csvCell(value: string) {
  const escaped = value.replaceAll('"', '""')
  return `"${escaped}"`
}

function defaultSubmissionDraft(): SubmissionDraft {
  return {
    title: '',
    firstName: '',
    middleName: '',
    lastName: '',
    publishedOn: '',
    department: '',
    documentType: '',
    degree: '',
    thesisAdvisor: '',
    panelChair: '',
    panelMembers: '',
    keywords: '',
    abstract: '',
    fileName: '',
  }
}

function apiDefaultSettings(): AllSettings {
  return {
    general: {
      repositoryName: 'CEDAR',
      description: 'College of Education Digital Archive and Repository',
      contactEmail: 'cedar@ust.edu.ph',
      contactPhone: '+63 2 1234 5678',
      institutionName: 'University of Santo Tomas',
      departmentName: 'College of Education',
    },
    notifications: {
      submissionReceived: { enabled: true, template: 'A new thesis submission has been received and is awaiting review.' },
      reviewComplete: { enabled: true, template: 'Your thesis submission review has been completed.' },
      revisionRequested: { enabled: true, template: 'Revisions have been requested for your thesis submission.' },
      rejectionNotice: { enabled: true, template: 'Your thesis submission has been declined.' },
    },
    access: {
      defaultUserRole: 'Student',
      repositoryVisibility: 'public',
      selfRegistration: false,
      requireApprovalForAccess: true,
    },
    compliance: {
      dublinCorePublisher: 'University of Santo Tomas',
      dublinCoreLanguage: 'en',
      dublinCoreRights: 'All rights reserved',
      oaisPreservationLevel: 'silver',
      enableOaiPmh: false,
      metadataPrefix: 'oai_dc',
    },
    auditRetention: {
      logRetentionDays: 365,
      autoArchiveAfterDays: 90,
      enablePurge: false,
      purgeOlderThanDays: 730,
    },
    profile: {
      displayName: 'CEDAR Administrator',
      email: 'cedar@ust.edu.ph',
    },
    appearance: {
      dateFormat: 'MM/DD/YYYY',
      timezone: 'Asia/Manila',
      itemsPerPage: 10,
      language: 'English',
    },
  }
}

export const apiAdminRepositoryTestables = {
  apiDefaultSettings,
  buildAuditLogs,
  buildDepartmentBreakdown,
  buildStatusBreakdown,
  buildTrendPoints,
  buildUsageSnapshot,
  buildUserGrowth,
  countSubmissionsByStatus,
  csvCell,
  defaultSubmissionDraft,
  filterSubmissions,
  formatSubmissionDate,
  isApprovedLikeStatus,
  mapDraftPayloadToSubmissionDraft,
  mapRoleCodeToUserRole,
  mapSubmission,
  mapUserStatusCode,
  mapWorkflowStatusToSubmissionStatus,
  normalizeLookupValue,
  normalizeReportFilters,
  reviewActionToReviewEventType,
  reviewActionToStatus,
  slugify,
  splitCommaField,
  toAuditEntityType,
  toAuditEventType,
  toIsoDate,
  toReviewHistoryType,
}

