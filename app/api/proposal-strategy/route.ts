import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { generateProposalStrategy } from '@/lib/ai/proposal-strategy'
import type { Contract, OpportunityBrief, BusinessProfile, ProposalStrategy } from '@/types'

export const dynamic = 'force-dynamic'

// POST /api/proposal-strategy
// Body: { contract_id: string; business_profile_id: string; refresh?: boolean }
export async function POST(req: NextRequest) {
  let body: { contract_id?: string; business_profile_id?: string; refresh?: boolean }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { contract_id, business_profile_id, refresh = false } = body

  if (!contract_id || !business_profile_id) {
    return NextResponse.json(
      { error: 'contract_id and business_profile_id are required' },
      { status: 400 },
    )
  }

  const db = supabaseServer
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  // Return cached strategy unless refresh requested
  if (!refresh) {
    const { data: cached } = await db
      .from('proposal_strategies')
      .select('*')
      .eq('contract_id', contract_id)
      .eq('business_profile_id', business_profile_id)
      .maybeSingle()

    if (cached) {
      return NextResponse.json({ strategy: cached as ProposalStrategy })
    }
  }

  // Load contract
  const { data: contract, error: contractErr } = await db
    .from('contracts')
    .select('*')
    .eq('id', contract_id)
    .maybeSingle()

  if (contractErr || !contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  // Load business profile
  const { data: profile, error: profileErr } = await db
    .from('business_profiles')
    .select('*')
    .eq('id', business_profile_id)
    .maybeSingle()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Business profile not found' }, { status: 404 })
  }

  // Load opportunity brief (may not exist yet)
  const { data: brief } = await db
    .from('opportunity_briefs')
    .select('*')
    .eq('contract_id', contract_id)
    .maybeSingle()

  // Generate strategy
  let strategy: ProposalStrategy
  try {
    strategy = await generateProposalStrategy(
      contract as Contract,
      brief as OpportunityBrief | null,
      profile as BusinessProfile,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Strategy generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Upsert (conflict on contract_id + business_profile_id)
  const { data: saved, error: upsertErr } = await db
    .from('proposal_strategies')
    .upsert(
      { ...strategy, updated_at: new Date().toISOString() },
      { onConflict: 'contract_id,business_profile_id' },
    )
    .select()
    .maybeSingle()

  if (upsertErr) {
    console.error('[proposal-strategy] upsert error:', upsertErr)
    // Return the generated strategy even if save failed
    return NextResponse.json({ strategy })
  }

  return NextResponse.json({ strategy: (saved ?? strategy) as ProposalStrategy })
}

// GET /api/proposal-strategy?contract_id=<uuid>&business_profile_id=<uuid>
export async function GET(req: NextRequest) {
  const contractId  = req.nextUrl.searchParams.get('contract_id')
  const profileId   = req.nextUrl.searchParams.get('business_profile_id')

  if (!contractId || !profileId) {
    return NextResponse.json({ error: 'contract_id and business_profile_id are required' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ strategy: null })

  const { data } = await db
    .from('proposal_strategies')
    .select('*')
    .eq('contract_id', contractId)
    .eq('business_profile_id', profileId)
    .maybeSingle()

  return NextResponse.json({ strategy: (data as ProposalStrategy | null) ?? null })
}
