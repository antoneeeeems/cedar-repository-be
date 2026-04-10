import { getSupabaseAnonClient } from '@/lib/supabase'

export function createClient() {
  return getSupabaseAnonClient()
}
