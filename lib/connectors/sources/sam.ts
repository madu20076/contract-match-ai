import { ProcurementConnector } from '../connector'
import { parseDate, stripHtml, toMmDdYyyy } from '../parser'
import type { FetchOptions, SourceType } from '../connector'
import type { NormalizedOpportunity } from '../normalizer'

// SAM.gov Contract Opportunities API v2
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
// Env:  SAMGOV_API_KEY — register free at https://api.sam.gov

const SET_ASIDE_CERTS: Record<string, string[]> = {
  SBA: ['SDB'],   SBP: ['SDB'],
  '8AN': ['8(a)'], HZC: ['HUBZone'],
  WOSB: ['WOSB'],  EDWOSB: ['WOSB'],
  VSB: ['VOSB'],   SDVOSBC: ['SDVOSB'], SDVOSBS: ['SDVOSB'],
  MBE: ['MBE'],    DBE: ['DBE'],
}

const SET_ASIDE_LABEL: Record<string, string> = {
  SBA: 'Small Business', SBP: 'Small Business',
  '8AN': '8(a)', HZC: 'HUBZone',
  WOSB: 'WOSB', EDWOSB: 'EDWOSB',
  VSB: 'VOSB', SDVOSBC: 'SDVOSB', SDVOSBS: 'SDVOSB',
  OOSP: 'Unrestricted', ONE: 'Unrestricted',
}

interface OrgEntry  { level: string; name: string }
interface PlacePerf { city?: { name: string }; state?: { code: string } }
interface OfficeAddr { city?: string; state?: string }
interface AwardInfo  { amount?: number }

export interface SamOpportunity {
  noticeId:              string
  title:                 string
  solicitationNumber?:   string
  naicsCode?:            string
  responseDeadLine?:     string
  archiveDate?:          string
  postedDate?:           string
  type?:                 string
  setAside?:             string
  setAsideCode?:         string
  description?:          string
  fullParentPathName?:   string
  organizationHierarchy?: OrgEntry[]
  placeOfPerformance?:   PlacePerf
  officeAddress?:        OfficeAddr
  awardFloor?:           number
  awardCeil?:            number
  award?:                AwardInfo
}

interface SamApiResponse {
  totalRecords:       number
  opportunitiesData?: SamOpportunity[]
}

const MOCK_RECORDS: SamOpportunity[] = [
  {
    noticeId: 'SAM-2026-001', solicitationNumber: 'VA-36C10X26R0042',
    title: 'IT Infrastructure Maintenance and Support Services',
    organizationHierarchy: [{ level: 'Department', name: 'Dept of Veterans Affairs' }],
    naicsCode: '541512', responseDeadLine: '2026-08-15 00:00:00+0000',
    postedDate: '2026-06-01 00:00:00+0000', setAside: 'SDVOSBC',
    description: 'Comprehensive IT infrastructure maintenance including server management, network monitoring, and help desk support for VA facilities.',
    placeOfPerformance: { city: { name: 'Washington' }, state: { code: 'DC' } },
    awardFloor: 250000, awardCeil: 500000,
  },
  {
    noticeId: 'SAM-2026-002', solicitationNumber: 'DHS-26-B-00173',
    title: 'Cybersecurity Assessment and Continuous Monitoring',
    organizationHierarchy: [{ level: 'Department', name: 'Dept of Homeland Security' }],
    naicsCode: '541519', responseDeadLine: '2026-07-30 00:00:00+0000',
    postedDate: '2026-06-10 00:00:00+0000', setAside: '8AN',
    description: 'Ongoing cybersecurity assessments, penetration testing, and continuous monitoring for agency networks.',
    placeOfPerformance: { city: { name: 'Arlington' }, state: { code: 'VA' } },
    awardFloor: 500000, awardCeil: 2000000,
  },
  {
    noticeId: 'SAM-2026-003', solicitationNumber: 'GS-04P-26-HJ-C-0019',
    title: 'General Construction and Renovation — Federal Buildings',
    organizationHierarchy: [{ level: 'Department', name: 'General Services Administration' }],
    naicsCode: '236220', responseDeadLine: '2026-09-01 00:00:00+0000',
    postedDate: '2026-06-05 00:00:00+0000', setAside: 'HZC',
    description: 'Construction and renovation services for federal office buildings in the Atlanta region.',
    placeOfPerformance: { city: { name: 'Atlanta' }, state: { code: 'GA' } },
    awardFloor: 1000000, awardCeil: 5000000,
  },
  {
    noticeId: 'SAM-2026-004', solicitationNumber: 'HHS-2026-NIH-SS-0047',
    title: 'Healthcare Staffing and Workforce Solutions',
    organizationHierarchy: [{ level: 'Department', name: 'Dept of Health and Human Services' }],
    naicsCode: '561320', responseDeadLine: '2026-08-01 00:00:00+0000',
    postedDate: '2026-06-12 00:00:00+0000', setAside: 'WOSB',
    description: 'Temporary and permanent healthcare professionals including registered nurses and administrative staff.',
    placeOfPerformance: { city: { name: 'Rockville' }, state: { code: 'MD' } },
    awardFloor: 750000, awardCeil: 3000000,
  },
  {
    noticeId: 'SAM-2026-005', solicitationNumber: 'SP4705-26-R-0091',
    title: 'Logistics and Supply Chain Support',
    organizationHierarchy: [{ level: 'Department', name: 'Defense Logistics Agency' }],
    naicsCode: '488510', responseDeadLine: '2026-08-22 00:00:00+0000',
    postedDate: '2026-06-08 00:00:00+0000', setAside: 'SDVOSBC',
    description: 'Warehouse management, inventory control, and supply chain analytics for DLA distribution centers.',
    placeOfPerformance: { city: { name: 'Fort Belvoir' }, state: { code: 'VA' } },
    awardFloor: 2000000, awardCeil: 8000000,
  },
  {
    noticeId: 'SAM-2026-006', solicitationNumber: 'OPM-HR-SOLHQ-26-0033',
    title: 'Professional Training and Development Services',
    organizationHierarchy: [{ level: 'Department', name: 'Office of Personnel Management' }],
    naicsCode: '611430', responseDeadLine: '2026-09-15 00:00:00+0000',
    postedDate: '2026-06-18 00:00:00+0000', setAside: '8AN',
    description: 'Leadership development and technical skills training for federal employees.',
    placeOfPerformance: { city: { name: 'Washington' }, state: { code: 'DC' } },
    awardFloor: 150000, awardCeil: 600000,
  },
]

class SamConnector extends ProcurementConnector {
  readonly slug = 'samgov'
  readonly name = 'SAM.gov'
  readonly type: SourceType = 'federal'

  protected async fetch(options?: FetchOptions): Promise<SamOpportunity[]> {
    const apiKey = process.env.SAMGOV_API_KEY

    if (!apiKey) {
      let records = MOCK_RECORDS
      const filters = options?.filters
      if (filters?.naicsCode) {
        records = records.filter((r) => r.naicsCode?.startsWith(filters.naicsCode!))
      }
      if (filters?.setAside) {
        records = records.filter((r) =>
          (r.setAside ?? '').toUpperCase() === filters.setAside!.toUpperCase()
        )
      }
      if (filters?.agency) {
        const q = filters.agency.toLowerCase()
        records = records.filter((r) =>
          (r.organizationHierarchy ?? []).some((o) => o.name.toLowerCase().includes(q)) ||
          (r.fullParentPathName ?? '').toLowerCase().includes(q)
        )
      }
      return records
    }

    const now  = new Date()
    const from = options?.since ?? new Date(now.getTime() - 30 * 86_400_000)
    const filters = options?.filters

    const results: SamOpportunity[] = []
    const pageSize = 100
    let offset = 0
    let total  = Infinity

    while (offset < Math.min(total, 1000)) {
      const qs = new URLSearchParams({
        api_key:    apiKey,
        limit:      String(pageSize),
        offset:     String(offset),
        postedFrom: filters?.postedFrom ? toMmDdYyyy(filters.postedFrom) : toMmDdYyyy(from),
        postedTo:   filters?.postedTo   ? toMmDdYyyy(filters.postedTo)   : toMmDdYyyy(now),
        ptype:      'o,k,r,p',
        status:     'active',
      })

      if (filters?.naicsCode)  qs.set('naicsCode',          filters.naicsCode)
      if (filters?.agency)     qs.set('deptname',           filters.agency)
      if (filters?.setAside)   qs.set('typeOfSetAsideCode', filters.setAside)
      if (filters?.keyword)    qs.set('keyword',            filters.keyword)

      let res: Response
      try {
        res = await fetch(
          `https://api.sam.gov/opportunities/v2/search?${qs}`,
          { cache: 'no-store', signal: AbortSignal.timeout(30_000) },
        )
      } catch (err) {
        throw new Error(`SAM.gov network error: ${err instanceof Error ? err.message : String(err)}`)
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`SAM.gov API ${res.status}: ${body.slice(0, 400)}`)
      }

      const json   = (await res.json()) as SamApiResponse
      total        = json.totalRecords ?? 0
      const batch  = json.opportunitiesData ?? []

      for (const opp of batch) {
        if ((opp.noticeId ?? opp.solicitationNumber ?? '').trim()) {
          results.push(opp)
        }
      }

      offset += pageSize
      if (batch.length < pageSize) break
    }

    return results
  }

  protected parse(raw: unknown): SamOpportunity | null {
    const d = raw as SamOpportunity
    if (!d.title?.trim()) return null
    if (!(d.noticeId ?? d.solicitationNumber)?.trim()) return null
    return d
  }

  protected normalize(parsed: unknown): NormalizedOpportunity | null {
    const d = parsed as SamOpportunity

    const title = (d.title ?? '').trim()
    if (!title) return null

    const dueDate = parseDate(d.responseDeadLine) ?? parseDate(d.archiveDate) ?? null
    if (!dueDate) return null

    const extId = (d.noticeId ?? d.solicitationNumber ?? '').trim()
    if (!extId) return null

    const hier     = d.organizationHierarchy ?? []
    const topOrg   = hier.find((o) => o.level === 'Department') ?? hier[0]
    const pathPart = String(d.fullParentPathName ?? '').split('.')[0].trim()
    const agencyFromPath = pathPart
    const agency   = (topOrg?.name ?? agencyFromPath) || 'Federal Agency'

    const perf   = d.placeOfPerformance
    const office = d.officeAddress
    const state  = perf?.state?.code ?? office?.state ?? 'DC'
    const city   = perf?.city?.name  ?? office?.city  ?? 'Washington'

    const naicsCode = (d.naicsCode ?? '').trim()
    const setAside  = (d.setAside ?? d.setAsideCode ?? '').toUpperCase().trim()

    const valueMin = typeof d.awardFloor === 'number' ? d.awardFloor : undefined
    const valueMax = typeof d.awardCeil  === 'number' ? d.awardCeil
                   : typeof d.award?.amount === 'number' ? d.award.amount
                   : undefined

    return {
      external_id:             extId,
      source_slug:             'samgov',
      source_name:             'SAM.gov',
      source_url:              `https://sam.gov/opp/${extId}/view`,
      title,
      agency,
      location:                city && state ? `${city}, ${state}` : state,
      state,
      due_date:                dueDate,
      posted_date:             parseDate(d.postedDate) ?? undefined,
      value_min:               valueMin,
      value_max:               valueMax,
      description:             stripHtml(String(d.description ?? title)).slice(0, 4000),
      requirements:            [],
      naics_codes:             naicsCode ? [naicsCode] : [],
      certifications_required: SET_ASIDE_CERTS[setAside] ?? [],
      solicitation_type:       SET_ASIDE_LABEL[setAside] ?? (setAside || undefined),
      set_aside:               setAside || undefined,
      solicitation_number:     (d.solicitationNumber ?? '').trim() || undefined,
      raw_data:                d as unknown as Record<string, unknown>,
    }
  }
}

export const sam = new SamConnector()
