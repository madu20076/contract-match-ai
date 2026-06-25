import { NextRequest, NextResponse } from 'next/server'
import { getQueueStats, processAllPending, getRecentJobs } from '@/lib/jobs/brief-generator'

export const dynamic = 'force-dynamic'

// GET /api/jobs/process-briefs — queue stats and recent jobs
export async function GET() {
  const [stats, jobs] = await Promise.all([getQueueStats(), getRecentJobs(50)])
  return NextResponse.json({ stats, jobs })
}

// POST /api/jobs/process-briefs — run the worker
// ?retry=true to reprocess failed jobs
// ?limit=N to cap how many jobs to process (default 20)
export async function POST(req: NextRequest) {
  const sp         = req.nextUrl.searchParams
  const retryFailed = sp.get('retry') === 'true'
  const limit      = Math.min(100, parseInt(sp.get('limit') ?? '20', 10))

  const result = await processAllPending(limit, retryFailed)

  return NextResponse.json({
    ok:        result.failed === 0,
    processed: result.processed,
    failed:    result.failed,
    errors:    result.errors,
  })
}
