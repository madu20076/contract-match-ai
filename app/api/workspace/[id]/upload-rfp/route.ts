import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import {
  parseRFPDocument,
  extractTextFromDocx,
  extractTextFromPdf,
} from '@/lib/ai/rfp-parser'
import type {
  Contract,
  RFPDocument,
  RFPRequirement,
  ComplianceItem,
  ProposalReadiness,
  RFPAmendment,
} from '@/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Section type → requirement types it addresses
const SECTION_COVERS: Record<string, string[]> = {
  executive_summary:  ['evaluation_factor'],
  technical_approach: ['mandatory', 'technical', 'deliverable'],
  management_plan:    ['management', 'mandatory'],
  staffing_plan:      ['certification', 'management'],
  quality_control:    ['mandatory', 'technical'],
  past_performance:   ['evaluation_factor'],
  pricing_narrative:  ['clin'],
  cover_letter:       ['date_milestone'],
  compliance_matrix:  ['mandatory', 'evaluation_factor', 'deliverable', 'certification'],
}

// POST /api/workspace/[id]/upload-rfp
// multipart/form-data, field name: "rfp"
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: workspaceId } = await params

  const db = supabaseServer
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('rfp') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded (field name: rfp)' }, { status: 400 })

  const fileName = file.name
  const mimeType = file.type || 'application/octet-stream'
  const fileSize = file.size

  // Load workspace + context data in parallel
  const [wsRes, sectionsRes, tasksRes] = await Promise.all([
    db.from('proposal_workspaces').select('*').eq('id', workspaceId).maybeSingle(),
    db.from('proposal_sections').select('id, section_type').eq('workspace_id', workspaceId),
    db.from('proposal_tasks').select('status').eq('workspace_id', workspaceId),
  ])

  if (!wsRes.data) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const workspace  = wsRes.data
  const existingSections = (sectionsRes.data ?? []) as Array<{ id: string; section_type: string }>
  const allTasks         = (tasksRes.data  ?? []) as Array<{ status: string }>

  const { data: contractRow } = await db
    .from('contracts').select('*').eq('id', workspace.contract_id).maybeSingle()
  const contract = contractRow as Contract | null

  // Extract text from uploaded file
  const buffer = Buffer.from(await file.arrayBuffer())
  let extractedText = ''

  if (mimeType.includes('docx') || mimeType.includes('openxmlformats') || fileName.endsWith('.docx')) {
    extractedText = await extractTextFromDocx(buffer)
  } else if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
    extractedText = await extractTextFromPdf(buffer)
  } else if (mimeType.startsWith('text/') || fileName.endsWith('.txt')) {
    extractedText = buffer.toString('utf-8')
  }

  // Upload to Supabase Storage (graceful fallback)
  const safeFileName  = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath   = `workspace-${workspaceId}/${Date.now()}-${safeFileName}`
  let   finalPath     = storagePath

  const { error: uploadErr } = await db.storage
    .from('rfp-documents')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

  if (uploadErr) {
    console.error('[upload-rfp] Storage error (non-fatal):', uploadErr.message)
    finalPath = `pending:${storagePath}`
  }

  // Upsert rfp_documents record
  const { data: rfpDoc, error: docErr } = await db
    .from('rfp_documents')
    .upsert(
      {
        workspace_id:   workspaceId,
        file_name:      fileName,
        file_path:      finalPath,
        file_size:      fileSize,
        mime_type:      mimeType,
        extracted_text: extractedText.slice(0, 50_000),
        parsed_at:      new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    )
    .select()
    .single()

  if (docErr || !rfpDoc) {
    return NextResponse.json({ error: docErr?.message ?? 'Failed to save RFP record' }, { status: 500 })
  }

  const rfpDocId = (rfpDoc as RFPDocument).id

  // Parse the RFP with Claude or rule-based fallback
  const parsed = await parseRFPDocument({ text: extractedText, contract })

  // Flatten all extracted items into rfp_requirements rows
  const allReqs = [
    ...parsed.requirements.map((r, i) => ({
      rfp_document_id:  rfpDocId,
      workspace_id:     workspaceId,
      requirement_type: r.type,
      text:             r.text.slice(0, 1000),
      source_section:   r.section,
      priority:         r.priority,
      sort_order:       i,
    })),
    ...parsed.deliverables.map((r, i) => ({
      rfp_document_id:  rfpDocId,
      workspace_id:     workspaceId,
      requirement_type: r.type,
      text:             r.text.slice(0, 1000),
      source_section:   r.section,
      priority:         r.priority,
      sort_order:       100 + i,
    })),
    ...parsed.certifications.map((r, i) => ({
      rfp_document_id:  rfpDocId,
      workspace_id:     workspaceId,
      requirement_type: r.type,
      text:             r.text.slice(0, 500),
      source_section:   r.section,
      priority:         r.priority,
      sort_order:       200 + i,
    })),
    ...parsed.evaluation_factors.map((ef, i) => ({
      rfp_document_id:  rfpDocId,
      workspace_id:     workspaceId,
      requirement_type: 'evaluation_factor' as const,
      text:             `${ef.name}: ${ef.description}`.slice(0, 500),
      source_section:   'Section M',
      priority:         'high' as const,
      sort_order:       300 + i,
    })),
    ...parsed.clins.map((c, i) => ({
      rfp_document_id:  rfpDocId,
      workspace_id:     workspaceId,
      requirement_type: 'clin' as const,
      text:             `CLIN ${c.number}: ${c.description}`.slice(0, 500),
      source_section:   'Schedule',
      priority:         'high' as const,
      sort_order:       400 + i,
    })),
  ]

  await db.from('rfp_requirements').delete().eq('workspace_id', workspaceId)
  let insertedRequirements: RFPRequirement[] = []
  if (allReqs.length > 0) {
    const { data } = await db.from('rfp_requirements').insert(allReqs).select()
    insertedRequirements = (data ?? []) as RFPRequirement[]
  }

  // Build compliance matrix
  const existingSectionTypes = new Set(existingSections.map(s => s.section_type))
  const sectionById         = Object.fromEntries(existingSections.map(s => [s.section_type, s.id]))

  const complianceRows = insertedRequirements.map(req => {
    const matchedType = Object.keys(SECTION_COVERS).find(st =>
      SECTION_COVERS[st].includes(req.requirement_type) && existingSectionTypes.has(st)
    )
    return {
      workspace_id:         workspaceId,
      rfp_requirement_id:   req.id,
      proposal_section_id:  matchedType ? sectionById[matchedType] ?? null : null,
      section_type:         matchedType ?? null,
      requirement_text:     req.text.slice(0, 500),
      compliance_status:    (matchedType ? 'partial' : 'not_addressed') as ComplianceItem['compliance_status'],
      updated_at:           new Date().toISOString(),
    }
  })

  await db.from('compliance_matrix').delete().eq('workspace_id', workspaceId)
  let complianceItems: ComplianceItem[] = []
  if (complianceRows.length > 0) {
    const { data } = await db.from('compliance_matrix').insert(complianceRows).select()
    complianceItems = (data ?? []) as ComplianceItem[]
  }

  // Calculate proposal readiness score
  const totalReqs         = insertedRequirements.length
  const addressedReqs     = complianceItems.filter(c => c.compliance_status !== 'not_addressed').length
  const totalSectionTypes = 9
  const generatedSections = existingSectionTypes.size
  const totalTasks        = allTasks.length
  const doneTasks         = allTasks.filter(t => t.status === 'done').length

  const complianceScore   = totalReqs > 0 ? Math.round((addressedReqs / totalReqs) * 100) : 0
  const sectionsScore     = Math.round((generatedSections / totalSectionTypes) * 100)
  const completenessScore = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const overallScore      = Math.round(sectionsScore * 0.4 + complianceScore * 0.4 + completenessScore * 0.2)

  const riskLevel: ProposalReadiness['risk_level'] =
    overallScore >= 80 ? 'low'    :
    overallScore >= 60 ? 'medium' :
    overallScore >= 40 ? 'high'   : 'critical'

  const redFlags: string[]    = []
  const actionItems: string[] = []

  if (generatedSections === 0)
    redFlags.push('No proposal sections generated yet — start with Technical Approach and Executive Summary')
  if (totalReqs > 0 && complianceScore < 30)
    redFlags.push(`Only ${complianceScore}% of RFP requirements are addressed by existing proposal sections`)
  if (totalTasks > 0 && completenessScore < 25)
    redFlags.push('Fewer than 25% of proposal tasks are complete')
  if (parsed.certifications.length > 0 && !existingSectionTypes.has('staffing_plan'))
    redFlags.push(`${parsed.certifications.length} certification requirements detected — generate a Staffing Plan`)

  if (generatedSections < 3)
    actionItems.push('Generate at least 3 proposal sections starting with Technical Approach, Executive Summary, and Past Performance')
  if (complianceScore < 50)
    actionItems.push('Review the Compliance Matrix to identify unaddressed RFP requirements')
  if (totalTasks > 0 && completenessScore < 50)
    actionItems.push('Complete outstanding proposal tasks in the Tasks tab')
  if (parsed.amendments.length > 0)
    actionItems.push(`Review ${parsed.amendments.length} solicitation amendment(s) for due date or scope changes`)

  const { data: readinessRow } = await db
    .from('proposal_readiness')
    .upsert(
      {
        workspace_id:       workspaceId,
        overall_score:      overallScore,
        sections_score:     sectionsScore,
        compliance_score:   complianceScore,
        completeness_score: completenessScore,
        risk_level:         riskLevel,
        red_flags:          redFlags,
        action_items:       actionItems,
        generated_at:       new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    )
    .select()
    .single()

  const readiness = readinessRow as ProposalReadiness | null

  // Store amendments
  let amendments: RFPAmendment[] = []
  if (parsed.amendments.length > 0) {
    await db.from('rfp_amendments').delete().eq('rfp_document_id', rfpDocId)
    const { data: amdData } = await db
      .from('rfp_amendments')
      .insert(
        parsed.amendments.map(a => ({
          rfp_document_id:  rfpDocId,
          workspace_id:     workspaceId,
          amendment_number: a.number,
          issued_date:      a.date && a.date !== 'TBD' ? a.date : null,
          due_date_change:  a.due_date_change || null,
          changes:          a.changes,
        })),
      )
      .select()
    amendments = (amdData ?? []) as RFPAmendment[]
  }

  return NextResponse.json({
    document:        rfpDoc as RFPDocument,
    requirements:    insertedRequirements,
    complianceItems,
    readiness,
    amendments,
    parsed: {
      agency:              parsed.agency,
      solicitation_number: parsed.solicitation_number,
      contract_type:       parsed.contract_type,
      proposal_due_date:   parsed.proposal_due_date,
      set_aside:           parsed.set_aside,
      naics_code:          parsed.naics_code,
      parsed_by:           parsed.parsed_by,
      key_dates:           parsed.key_dates,
    },
  })
}
