import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/matches/generate
// Body: { profile_id: string }
// Calls generate_matches_for_profile RPC for the given profile
export async function POST(req: NextRequest) {
  let body: { profile_id?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { profile_id } = body
  if (!profile_id || !UUID_RE.test(profile_id)) {
    return NextResponse.json({ error: 'profile_id must be a valid UUID' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { error } = await db.rpc('generate_matches_for_profile', { profile_id })

  if (error) {
    console.error('[matches/generate] RPC error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { count } = await db
    .from('contract_matches')
    .select('*', { count: 'exact', head: true })
    .eq('business_profile_id', profile_id)

  return NextResponse.json({ success: true, match_count: count ?? 0 })
}
