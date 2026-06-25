import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { ProposalTask } from '@/types'

export const dynamic = 'force-dynamic'

// PATCH /api/workspace/[id]/tasks
// Body: { task_id, status }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params

  let body: { task_id?: string; status?: ProposalTask['status'] }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { task_id, status } = body
  if (!task_id || !status) {
    return NextResponse.json({ error: 'task_id and status are required' }, { status: 400 })
  }

  const VALID = new Set(['todo', 'in_progress', 'done'])
  if (!VALID.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const { data: task, error } = await db
    .from('proposal_tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', task_id)
    .eq('workspace_id', workspaceId)
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: task as ProposalTask })
}

// POST /api/workspace/[id]/tasks
// Body: { title, section, priority, due_date?, description? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params

  let body: {
    title?:       string
    section?:     string
    priority?:    ProposalTask['priority']
    due_date?:    string
    description?: string
  }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const { data: task, error } = await db
    .from('proposal_tasks')
    .insert({
      workspace_id: workspaceId,
      title:        body.title,
      section:      body.section ?? 'General',
      priority:     body.priority ?? 'medium',
      due_date:     body.due_date,
      description:  body.description,
      status:       'todo',
      sort_order:   999,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ task: task as ProposalTask })
}
