import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { generateWorkspaceTasks } from '@/lib/ai/workspace-tasks'
import type { Contract, ProposalStrategy, ProposalWorkspace, ProposalTask, ProposalDocument, ProposalNote } from '@/types'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/workspace
// Body: { contract_id, business_profile_id }
// Creates the workspace if it doesn't exist, then returns full workspace data
export async function POST(req: NextRequest) {
  let body: { contract_id?: string; business_profile_id?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { contract_id, business_profile_id } = body
  if (!contract_id || !business_profile_id) {
    return NextResponse.json(
      { error: 'contract_id and business_profile_id are required' },
      { status: 400 },
    )
  }

  if (!UUID_RE.test(contract_id) || !UUID_RE.test(business_profile_id)) {
    return NextResponse.json(
      { error: 'contract_id and business_profile_id must be valid UUIDs' },
      { status: 400 },
    )
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  // Check for existing workspace (with contract join)
  const { data: existing } = await db
    .from('proposal_workspaces')
    .select('*, contract:contracts(*)')
    .eq('contract_id', contract_id)
    .eq('business_profile_id', business_profile_id)
    .maybeSingle()

  let workspace: ProposalWorkspace

  if (existing) {
    workspace = existing as ProposalWorkspace

    // Load all associated data
    const [tasksRes, docsRes, noteRes] = await Promise.all([
      db.from('proposal_tasks').select('*')
        .eq('workspace_id', existing.id)
        .order('sort_order', { ascending: true }),
      db.from('proposal_documents').select('*')
        .eq('workspace_id', existing.id)
        .order('created_at', { ascending: false }),
      db.from('proposal_notes').select('*')
        .eq('workspace_id', existing.id)
        .maybeSingle(),
    ])

    return NextResponse.json({
      workspace,
      tasks:     (tasksRes.data ?? []) as ProposalTask[],
      documents: (docsRes.data  ?? []) as ProposalDocument[],
      note:      noteRes.data as ProposalNote | null,
    })
  }

  // Create new workspace
  const { data: newWs, error: wsErr } = await db
    .from('proposal_workspaces')
    .insert({ contract_id, business_profile_id, status: 'active' })
    .select('*, contract:contracts(*)')
    .single()

  if (wsErr || !newWs) {
    return NextResponse.json({ error: wsErr?.message ?? 'Failed to create workspace' }, { status: 500 })
  }

  workspace = newWs as ProposalWorkspace

  // Load contract + strategy for task generation
  const [contractRes, strategyRes] = await Promise.all([
    db.from('contracts').select('*').eq('id', contract_id).maybeSingle(),
    db.from('proposal_strategies').select('*')
      .eq('contract_id', contract_id)
      .eq('business_profile_id', business_profile_id)
      .maybeSingle(),
  ])

  const contract  = contractRes.data as Contract | null
  const strategy  = strategyRes.data as ProposalStrategy | null

  let tasks: ProposalTask[] = []
  if (contract) {
    try {
      const taskInputs = await generateWorkspaceTasks(contract, workspace.id, strategy)
      const { data: insertedTasks } = await db
        .from('proposal_tasks')
        .insert(taskInputs)
        .select()
      tasks = (insertedTasks ?? []) as ProposalTask[]
    } catch (err) {
      console.error('[workspace] task generation error:', err)
    }
  }

  // Create empty note
  const { data: note } = await db
    .from('proposal_notes')
    .insert({ workspace_id: workspace.id, content: '' })
    .select()
    .maybeSingle()

  return NextResponse.json({
    workspace,
    tasks,
    documents: [] as ProposalDocument[],
    note:      note as ProposalNote | null,
  })
}

// GET /api/workspace?contract_id=&profile_id=
export async function GET(req: NextRequest) {
  const contractId = req.nextUrl.searchParams.get('contract_id')
  const profileId  = req.nextUrl.searchParams.get('profile_id')

  if (!contractId || !profileId) {
    return NextResponse.json({ error: 'contract_id and profile_id are required' }, { status: 400 })
  }

  if (!UUID_RE.test(contractId) || !UUID_RE.test(profileId)) {
    return NextResponse.json({ error: 'contract_id and profile_id must be valid UUIDs' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ workspace: null, tasks: [], documents: [], note: null })

  const { data: workspace } = await db
    .from('proposal_workspaces')
    .select('*')
    .eq('contract_id', contractId)
    .eq('business_profile_id', profileId)
    .maybeSingle()

  if (!workspace) {
    return NextResponse.json({ workspace: null, tasks: [], documents: [], note: null })
  }

  const [tasksRes, docsRes, noteRes] = await Promise.all([
    db.from('proposal_tasks').select('*')
      .eq('workspace_id', workspace.id)
      .order('sort_order', { ascending: true }),
    db.from('proposal_documents').select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false }),
    db.from('proposal_notes').select('*')
      .eq('workspace_id', workspace.id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    workspace:  workspace as ProposalWorkspace,
    tasks:      (tasksRes.data ?? []) as ProposalTask[],
    documents:  (docsRes.data  ?? []) as ProposalDocument[],
    note:       noteRes.data as ProposalNote | null,
  })
}
