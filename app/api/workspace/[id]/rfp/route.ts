import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { RFPDocument, RFPRequirement, ComplianceItem, ProposalReadiness, RFPAmendment } from '@/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/workspace/[id]/rfp — fetch all RFP intelligence for a workspace
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id: workspaceId } = await params

  const db = supabaseServer
  if (!db) {
    return NextResponse.json({
      document: null, requirements: [], complianceItems: [], readiness: null, amendments: [],
    })
  }

  const [docRes, reqRes, compRes, readyRes] = await Promise.all([
    db.from('rfp_documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    db.from('rfp_requirements')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true }),
    db.from('compliance_matrix')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
    db.from('proposal_readiness')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ])

  const document = docRes.data as RFPDocument | null
  let amendments: RFPAmendment[] = []

  if (document) {
    const amdRes = await db
      .from('rfp_amendments')
      .select('*')
      .eq('rfp_document_id', document.id)
      .order('created_at', { ascending: true })
    amendments = (amdRes.data ?? []) as RFPAmendment[]
  }

  return NextResponse.json({
    document,
    requirements:    (reqRes.data  ?? []) as RFPRequirement[],
    complianceItems: (compRes.data ?? []) as ComplianceItem[],
    readiness:       readyRes.data as ProposalReadiness | null,
    amendments,
  })
}
