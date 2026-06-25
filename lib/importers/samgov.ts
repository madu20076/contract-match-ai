import type { SourceConnector, RawContract, NormalizedContract } from './types'

// Maps SAM.gov setAside codes → our certification short-codes
const SET_ASIDE_MAP: Record<string, string[]> = {
  SBA:      ['SDB'],
  SBP:      ['SDB'],
  '8AN':    ['8(a)'],
  HZC:      ['HUBZone'],
  WOSB:     ['WOSB'],
  EDWOSB:   ['WOSB'],
  VSB:      ['VOSB'],
  SDVOSBC:  ['SDVOSB'],
  SDVOSBS:  ['SDVOSB'],
  MBE:      ['MBE'],
  DBE:      ['DBE'],
}

function parseDate(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function mmddyyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

export const samgov: SourceConnector = {
  slug: 'samgov',
  name: 'SAM.gov',
  type: 'federal',

  isConfigured() {
    return !!process.env.SAMGOV_API_KEY
  },

  async fetchRaw(since?: Date): Promise<RawContract[]> {
    const apiKey = process.env.SAMGOV_API_KEY
    if (!apiKey) throw new Error('SAMGOV_API_KEY environment variable is not set')

    const now = new Date()
    const from = since ?? new Date(now.getTime() - 7 * 86_400_000)

    const results: RawContract[] = []
    const pageSize = 100
    let offset = 0
    let totalRecords = Infinity

    while (offset < Math.min(totalRecords, 1000)) {
      const qs = new URLSearchParams({
        api_key:    apiKey,
        limit:      String(pageSize),
        offset:     String(offset),
        postedFrom: mmddyyyy(from),
        postedTo:   mmddyyyy(now),
        ptype:      'o,k,r',     // solicitation, combined, pre-solicitation
        status:     'active',
      })

      const res = await fetch(
        `https://api.sam.gov/opportunities/v2/search?${qs}`,
        { cache: 'no-store' }
      )

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`SAM.gov API ${res.status}: ${body.slice(0, 400)}`)
      }

      const json = (await res.json()) as {
        totalRecords: number
        opportunitiesData?: Record<string, unknown>[]
      }

      totalRecords = json.totalRecords ?? 0
      const batch = json.opportunitiesData ?? []

      for (const opp of batch) {
        const extId = String(opp.noticeId ?? opp.solicitationNumber ?? '')
        if (extId) results.push({ external_id: extId, raw_data: opp })
      }

      offset += pageSize
      if (batch.length < pageSize) break
    }

    return results
  },

  normalize(raw: RawContract): NormalizedContract | null {
    const d = raw.raw_data

    const title = String(d.title ?? '').trim()
    if (!title) return null

    // Due date: prefer responseDeadLine, fall back to archiveDate
    const dueDate =
      parseDate(d.responseDeadLine) ??
      parseDate(d.archiveDate) ??
      null
    if (!dueDate) return null

    // Agency from org hierarchy or path
    const hierarchy = (d.organizationHierarchy as Record<string, string>[] | undefined) ?? []
    const topOrg = hierarchy.find((o) => o.level === 'Department') ?? hierarchy[0]
    const agencyFromPath = String(d.fullParentPathName ?? '').split('.')[0].trim()
    const agency = (topOrg?.name ?? agencyFromPath) || 'Federal Agency'

    // Location from place of performance, fallback to office address
    const perf = d.placeOfPerformance as Record<string, Record<string, string>> | undefined
    const office = d.officeAddress as Record<string, string> | undefined
    const state = perf?.state?.code ?? office?.state ?? 'DC'
    const city  = perf?.city?.name ?? office?.city ?? 'Washington'
    const location = city && state ? `${city}, ${state}` : state || 'Washington, DC'

    // NAICS
    const naicsRaw = d.naicsCode
    const naics_codes = naicsRaw ? [String(naicsRaw)] : []

    // Certifications from setAside code
    const setAside = String(d.setAside ?? '').toUpperCase()
    const certifications_required = SET_ASIDE_MAP[setAside] ?? []

    return {
      title,
      agency,
      location,
      state,
      due_date: dueDate,
      description: String(d.description ?? title).slice(0, 4000),
      requirements: [],
      naics_codes,
      certifications_required,
      solicitation_number: String(d.solicitationNumber ?? ''),
      posted_date:         parseDate(d.postedDate) ?? undefined,
      external_id:         raw.external_id,
      source_slug:         'samgov',
      raw_data:            raw.raw_data,
    }
  },
}
