import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { ProposalNote } from '@/types'

export const dynamic = 'force-dynamic'

// PUT /api/workspace/[id]/notes
// Body: { content }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params

  let body: { content?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const content = body.content ?? ''

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const { data: note, error } = await db
    .from('proposal_notes')
    .upsert(
      { workspace_id: workspaceId, content, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id' },
    )
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note: note as ProposalNote })
}
