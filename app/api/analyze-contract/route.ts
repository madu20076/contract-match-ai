import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { analyzeContract, DEMO_PROFILE } from '@/lib/ai/contract-analyzer'
import { getMockContractById } from '@/lib/mockData'
import type { Contract, BusinessProfile, ContractAnalysis } from '@/types'

export const dynamic = 'force-dynamic'

// POST /api/analyze-contract
// Body: { contract_id, business_profile_id?, refresh? }
export async function POST(req: NextRequest) {
  const body  = await req.json() as {
    contract_id:         string
    business_profile_id?: string
    refresh?:            boolean
  }
  const { contract_id, business_profile_id, refresh = false } = body

  if (!contract_id) {
    return NextResponse.json({ error: 'contract_id is required' }, { status: 400 })
  }

  const db = supabaseServer

  // ── 1. Load contract ────────────────────────────────────────
  let contract: Contract | null = null

  if (db && !contract_id.startsWith('mock-')) {
    const { data } = await db.from('contracts').select('*').eq('id', contract_id).single()
    contract = data as Contract | null
  }
  if (!contract) {
    contract = getMockContractById(contract_id) ?? null
  }
  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  // ── 2. Load business profile ────────────────────────────────
  let profile: BusinessProfile | null = null

  if (db && business_profile_id && business_profile_id !== 'demo') {
    const { data } = await db
      .from('business_profiles')
      .select('*')
      .eq('id', business_profile_id)
      .single()
    profile = data as BusinessProfile | null
  }

  // Fallback: latest profile in DB
  if (!profile && db) {
    const { data } = await db
      .from('business_profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    profile = data as BusinessProfile | null
  }

  // Last resort: demo profile
  if (!profile) {
    profile = DEMO_PROFILE
  }

  const effectiveProfileId = profile.id ?? 'demo'
  const isDemo = effectiveProfileId === 'demo'

  // ── 3. Return cached analysis (unless refresh) ──────────────
  if (db && !refresh && !isDemo) {
    const { data: cached } = await db
      .from('contract_analyses')
      .select('*')
      .eq('contract_id', contract_id)
      .eq('business_profile_id', effectiveProfileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached) {
      return NextResponse.json({
        analysis: cached as ContractAnalysis,
        cached:   true,
        profile_used: effectiveProfileId,
        is_demo:  isDemo,
      })
    }
  }

  // ── 4. Run analysis ─────────────────────────────────────────
  let analysis: ContractAnalysis
  try {
    analysis = await analyzeContract(contract, profile)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 500 })
  }

  // ── 5. Save to DB ───────────────────────────────────────────
  if (db && !isDemo) {
    const payload = {
      contract_id:                       analysis.contract_id,
      business_profile_id:               effectiveProfileId,
      fit_score:                         analysis.fit_score,
      win_probability:                   analysis.win_probability,
      risk_level:                        analysis.risk_level,
      proposal_effort:                   analysis.proposal_effort,
      executive_summary:                 analysis.executive_summary,
      why_it_matches:                    analysis.why_it_matches,
      risks:                             analysis.risks,
      missing_requirements:              analysis.missing_requirements,
      recommended_next_steps:            analysis.recommended_next_steps,
      questions_for_contracting_officer: analysis.questions_for_contracting_officer,
      ai_model:                          analysis.ai_model ?? null,
      is_ai_generated:                   analysis.is_ai_generated,
    }

    const { data: saved, error: saveErr } = await db
      .from('contract_analyses')
      .insert(payload)
      .select('id, created_at')
      .single()

    if (saved && !saveErr) {
      analysis.id         = saved.id as string
      analysis.created_at = saved.created_at as string
    }
  }

  return NextResponse.json({
    analysis,
    cached:       false,
    profile_used: effectiveProfileId,
    is_demo:      isDemo,
  })
}

// GET /api/analyze-contract?contract_id=&business_profile_id= — fetch existing analysis
export async function GET(req: NextRequest) {
  const sp          = req.nextUrl.searchParams
  const contractId  = sp.get('contract_id')
  const profileId   = sp.get('business_profile_id') ?? undefined

  if (!contractId) {
    return NextResponse.json({ error: 'contract_id is required' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ analysis: null })

  const query = db
    .from('contract_analyses')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (profileId && profileId !== 'demo') {
    query.eq('business_profile_id', profileId)
  }

  const { data } = await query.maybeSingle()
  return NextResponse.json({ analysis: data ?? null })
}
