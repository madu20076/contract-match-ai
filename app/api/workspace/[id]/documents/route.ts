import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { ProposalDocument } from '@/types'

export const dynamic = 'force-dynamic'

// POST /api/workspace/[id]/documents  (multipart/form-data)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${workspaceId}/${Date.now()}-${safeName}`

  // Attempt storage upload (non-fatal if bucket doesn't exist)
  let storedPath = filePath
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: storageErr } = await db.storage
      .from('proposal-documents')
      .upload(filePath, buffer, { contentType: file.type, upsert: false })

    if (storageErr) {
      console.warn('[documents] storage upload failed:', storageErr.message)
      storedPath = `pending:${filePath}`
    }
  } catch (err) {
    console.warn('[documents] storage error:', err)
    storedPath = `pending:${filePath}`
  }

  const { data: doc, error: dbErr } = await db
    .from('proposal_documents')
    .insert({
      workspace_id: workspaceId,
      name:         file.name,
      file_path:    storedPath,
      file_size:    file.size,
      mime_type:    file.type || 'application/octet-stream',
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ document: doc as ProposalDocument })
}

// DELETE /api/workspace/[id]/documents
// Body: { document_id }
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params

  let body: { document_id?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { document_id } = body
  if (!document_id) return NextResponse.json({ error: 'document_id is required' }, { status: 400 })

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const { data: doc } = await db
    .from('proposal_documents')
    .select('file_path')
    .eq('id', document_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Remove from storage if it was actually uploaded
  if (doc.file_path && !doc.file_path.startsWith('pending:')) {
    await db.storage.from('proposal-documents').remove([doc.file_path]).catch(() => {})
  }

  const { error } = await db
    .from('proposal_documents')
    .delete()
    .eq('id', document_id)
    .eq('workspace_id', workspaceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
