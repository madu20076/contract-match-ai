import { supabase, isSupabaseConfigured } from './supabase'
import type { BusinessProfile } from '@/types'

export async function getCurrentUser() {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

export async function getProfileIdForUser(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function getCurrentProfile(userId: string): Promise<BusinessProfile | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as BusinessProfile | null
}

export async function signOutUser(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
  if (typeof window !== 'undefined') {
    localStorage.removeItem('cmai_profile_id')
    localStorage.removeItem('cmai_profile_data')
  }
}
