import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { env } from '@/config/env'

const serviceClient = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

export function createClient() {
  return serviceClient
}

export function getSupabaseServiceClient() {
  return serviceClient
}

export function getSupabaseAnonClient(accessToken?: string) {
  return createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  })
}
