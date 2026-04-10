import type { AdminSession, UserRole, UserStatus } from '@/types/admin'

import { getSupabaseAnonClient } from '@/lib/supabase'

export type AdminProfileRecord = {
  full_name?: string | null
  email?: string | null
  role?: UserRole | null
  status?: UserStatus | null
  role_code?: string | null
  user_status_code?: string | null
}

const ALLOWED_ADMIN_ROLES = new Set<UserRole>(['Super Admin', 'Admin', 'Student'])

export function isAdminRole(role: unknown): role is UserRole {
  return typeof role === 'string' && ALLOWED_ADMIN_ROLES.has(role as UserRole)
}

export function canAccessAdmin(profile: AdminProfileRecord | null | undefined) {
  if (!profile) {
    return false
  }

  const normalizedRole = profile.role ?? mapRoleCodeToRole(profile.role_code)
  const normalizedStatus = profile.status ?? mapStatusCodeToStatus(profile.user_status_code)

  return normalizedStatus === 'Active' && isAdminRole(normalizedRole)
}

export function mapRoleCodeToRole(roleCode: string | null | undefined): UserRole | null {
  if (!roleCode) {
    return null
  }

  switch (roleCode.toLowerCase()) {
    case 'super_admin':
    case 'super-admin':
      return 'Super Admin'
    case 'admin':
      return 'Admin'
    case 'student':
      return 'Student'
    default:
      return null
  }
}

function mapStatusCodeToStatus(statusCode: string | null | undefined): UserStatus | null {
  if (!statusCode) {
    return null
  }

  switch (statusCode.toLowerCase()) {
    case 'active':
      return 'Active'
    case 'inactive':
      return 'Inactive'
    case 'pending':
      return 'Pending'
    default:
      return null
  }
}

export type SignInResult =
  | { ok: true; session: AdminSession }
  | { ok: false; message: string }

export type RefreshSessionResult =
  | { ok: true; session: AdminSession }
  | { ok: false; message: string }

export async function signInAdmin(email: string, password: string): Promise<SignInResult> {
  const normalizedEmail = email.trim()

  const supabase = getSupabaseAnonClient()

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (signInError || !signInData.session || !signInData.user) {
    return {
      ok: false,
      message: signInError?.message ?? 'Unable to sign in with the provided credentials.',
    }
  }

  const { data: profile } = await getSupabaseAnonClient(signInData.session.access_token)
    .schema('public')
    .from('profiles')
    .select('full_name,email,role_code,user_status_code')
    .eq('id', signInData.user.id)
    .maybeSingle()

  if (!canAccessAdmin(profile)) {
    return { ok: false, message: 'This account does not have portal access.' }
  }

  await getSupabaseAnonClient(signInData.session.access_token)
    .schema('public')
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', signInData.user.id)

  const session = buildAdminSession({
    profile,
    fallbackEmail: normalizedEmail,
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
  })

  return { ok: true, session }
}

export async function refreshAdminSession(refreshToken: string): Promise<RefreshSessionResult> {
  const supabase = getSupabaseAnonClient()
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })

  if (refreshError || !refreshData.session || !refreshData.user) {
    return {
      ok: false,
      message: refreshError?.message ?? 'Unable to refresh the current session.',
    }
  }

  const { data: profile } = await getSupabaseAnonClient(refreshData.session.access_token)
    .schema('public')
    .from('profiles')
    .select('full_name,email,role_code,user_status_code')
    .eq('id', refreshData.user.id)
    .maybeSingle()

  if (!canAccessAdmin(profile)) {
    return {
      ok: false,
      message: 'This account does not have portal access.',
    }
  }

  const session = buildAdminSession({
    profile,
    fallbackEmail: refreshData.user.email ?? 'unknown@cedar.local',
    accessToken: refreshData.session.access_token,
    refreshToken: refreshData.session.refresh_token,
  })

  return { ok: true, session }
}

export function buildAdminSession({
  profile,
  fallbackEmail,
  accessToken,
  refreshToken,
}: {
  profile: AdminProfileRecord | null | undefined
  fallbackEmail: string
  accessToken: string
  refreshToken?: string
}): AdminSession {
  return {
    name: typeof profile?.full_name === 'string' ? profile.full_name : 'CEDAR User',
    email: typeof profile?.email === 'string' ? profile.email : fallbackEmail,
    role: mapRoleCodeToRole(profile?.role_code) ?? 'Student',
    token: accessToken,
    refreshToken,
    loginAt: new Date().toISOString(),
  }
}
