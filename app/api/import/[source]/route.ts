import { NextRequest, NextResponse } from 'next/server'
import { runConnectorBySlug } from '@/lib/connectors/pipeline'

export const dynamic = 'force-dynamic'

// POST /api/import/[source] — trigger one source by slug
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params
  try {
    const result = await runConnectorBySlug(source)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
