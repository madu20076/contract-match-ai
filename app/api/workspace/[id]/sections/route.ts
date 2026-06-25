import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { generateProposalSection, SECTION_TITLES } from '@/lib/ai/proposal-section-generator'
import type {
  Contract,
  BusinessProfile,
  ProposalStrategy,
  OpportunityBrief,
  ProposalSection,
  SectionType,
} from '@/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/workspace/[id]/sections — list all sections for this workspace
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id: workspaceId } = await params

  const db = supabaseServer
  if (!db) return NextResponse.json({ sections: [] })

  const { data, error } = await db
    .from('proposal_sections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sections: (data ?? []) as ProposalSection[] })
}

// POST /api/workspace/[id]/sections — generate (or regenerate) a section
// Body: { section_type: SectionType; refresh?: boolean }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: workspaceId } = await params

  let body: { section_type?: string; refresh?: boolean }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sectionType = body.section_type as SectionType | undefined
  if (!sectionType) {
    return NextResponse.json({ error: 'section_type is required' }, { status: 400 })
  }

  const validTypes: SectionType[] = [
    'executive_summary', 'technical_approach', 'management_plan', 'staffing_plan',
    'quality_control', 'past_performance', 'pricing_narrative', 'cover_letter',
    'compliance_matrix',
  ]
  if (!validTypes.includes(sectionType)) {
    return NextResponse.json({ error: 'Invalid section_type' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  // Load workspace to get contract_id and business_profile_id
  const { data: workspace, error: wsErr } = await db
    .from('proposal_workspaces')
    .select('*')
    .eq('id', workspaceId)
    .maybeSingle()

  if (wsErr || !workspace) {
    return NextResponse.json({ error: wsErr?.message ?? 'Workspace not found' }, { status: 404 })
  }

  // Load contract, business profile, strategy, and brief in parallel
  const [contractRes, profileRes, strategyRes, briefRes] = await Promise.all([
    db.from('contracts').select('*').eq('id', workspace.contract_id).maybeSingle(),
    db.from('business_profiles').select('*').eq('id', workspace.business_profile_id).maybeSingle(),
    db.from('proposal_strategies').select('*')
      .eq('contract_id', workspace.contract_id)
      .eq('business_profile_id', workspace.business_profile_id)
      .maybeSingle(),
    db.from('opportunity_briefs').select('*')
      .eq('contract_id', workspace.contract_id)
      .maybeSingle(),
  ])

  const contract = contractRes.data as Contract | null
  const profile  = profileRes.data as BusinessProfile | null

  if (!contract || !profile) {
    return NextResponse.json({ error: 'Contract or business profile not found' }, { status: 404 })
  }

  // Generate the content
  let content: string
  let generatedBy: string

  try {
    content = await generateProposalSection({
      contract,
      businessProfile:  profile,
      proposalStrategy: strategyRes.data as ProposalStrategy | null,
      opportunityBrief: briefRes.data  as OpportunityBrief  | null,
      sectionType,
    })
    generatedBy = process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-4-6' : 'template'
  } catch (err) {
    console.error('[sections] generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    )
  }

  // Upsert — update if exists, insert if new
  const { data: section, error: upsertErr } = await db
    .from('proposal_sections')
    .upsert(
      {
        workspace_id: workspaceId,
        section_type: sectionType,
        title:        SECTION_TITLES[sectionType],
        content,
        status:       'draft',
        generated_by: generatedBy,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'workspace_id,section_type' },
    )
    .select()
    .single()

  if (upsertErr || !section) {
    return NextResponse.json({ error: upsertErr?.message ?? 'Failed to save section' }, { status: 500 })
  }

  return NextResponse.json({ section: section as ProposalSection })
}

// PUT /api/workspace/[id]/sections — save edited content
// Body: { section_id: string; content: string; status?: string }
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id: workspaceId } = await params

  let body: { section_id?: string; content?: string; status?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { section_id, content, status } = body
  if (!section_id || content === undefined) {
    return NextResponse.json({ error: 'section_id and content are required' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const update: Record<string, unknown> = {
    content,
    updated_at: new Date().toISOString(),
  }
  if (status && ['draft', 'review', 'final'].includes(status)) {
    update.status = status
  }

  const { data: section, error } = await db
    .from('proposal_sections')
    .update(update)
    .eq('id', section_id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error || !section) {
    return NextResponse.json({ error: error?.message ?? 'Failed to update section' }, { status: 500 })
  }

  return NextResponse.json({ section: section as ProposalSection })
}
