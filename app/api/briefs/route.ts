import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { OpportunityBrief } from '@/types'

export const dynamic = 'force-dynamic'

// GET /api/briefs?contract_id=<uuid>
export async function GET(req: NextRequest) {
  const contractId = req.nextUrl.searchParams.get('contract_id')
  if (!contractId) {
    return NextResponse.json({ error: 'contract_id is required' }, { status: 400 })
  }

  const db = supabaseServer
  if (!db) return NextResponse.json({ brief: null })

  const { data } = await db
    .from('opportunity_briefs')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle()

  return NextResponse.json({ brief: (data as OpportunityBrief | null) ?? null })
}
