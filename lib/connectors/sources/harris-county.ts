import { ProcurementConnector } from '../connector'
import type { FetchOptions, SourceType } from '../connector'
import type { NormalizedOpportunity } from '../normalizer'

// Harris County Purchasing Department (Bonfire eProcurement)
// Portal: https://harriscounty.bonfirehub.com
// No public API. Set HARRIS_COUNTY_API_KEY once Bonfire enterprise access is obtained.

interface BonfireRecord {
  id:                    string
  title:                 string
  department:            string
  published_date:        string
  close_date:            string
  description:           string
  commodity_codes:       string[]
  estimated_value_min?:  number
  estimated_value_max?:  number
}

const MOCK_HARRIS_COUNTY: BonfireRecord[] = [
  {
    id: 'HC-2026-0092', title: 'Fleet Vehicle Maintenance Services',
    department: 'Harris County Fleet Services',
    published_date: '2026-06-14', close_date: '2026-07-28',
    commodity_codes: ['811111', '811112'],
    description: 'Preventive maintenance, repair, and inspection of county fleet vehicles — patrol cars, heavy equipment, and light-duty trucks.',
    estimated_value_min: 500000, estimated_value_max: 2000000,
  },
  {
    id: 'HC-2026-0107', title: 'Janitorial and Custodial Services — County Buildings',
    department: 'Harris County Facilities & Property Management',
    published_date: '2026-06-20', close_date: '2026-08-08',
    commodity_codes: ['561720'],
    description: 'Janitorial and custodial services for Harris County administrative buildings, courthouses, and community centers across the county.',
    estimated_value_min: 300000, estimated_value_max: 900000,
  },
  {
    id: 'HC-2026-0054', title: 'Cybersecurity Assessment and Penetration Testing',
    department: 'Harris County Information Technology',
    published_date: '2026-06-10', close_date: '2026-07-15',
    commodity_codes: ['541512', '541519'],
    description: 'External and internal penetration testing, vulnerability assessments, and security posture review for Harris County IT infrastructure.',
    estimated_value_min: 100000, estimated_value_max: 350000,
  },
]

class HarrisCountyConnector extends ProcurementConnector {
  readonly slug = 'harris-county'
  readonly name = 'Harris County'
  readonly type: SourceType = 'county'

  protected async fetch(options?: FetchOptions): Promise<BonfireRecord[]> {
    if (!process.env.HARRIS_COUNTY_API_KEY) {
      const cutoff = options?.since ?? new Date(Date.now() - 7 * 86_400_000)
      return MOCK_HARRIS_COUNTY.filter((r) => new Date(r.published_date) >= cutoff)
    }

    const apiKey = process.env.HARRIS_COUNTY_API_KEY
    const since  = options?.since
    const qs = new URLSearchParams({
      api_key: apiKey,
      ...(since && { published_after: since.toISOString() }),
    })
    const res = await fetch(`https://api.gobonfire.com/v1/opportunities?${qs}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Harris County API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return (await res.json()) as BonfireRecord[]
  }

  protected parse(raw: unknown): BonfireRecord | null {
    const d = raw as BonfireRecord
    if (!d.title?.trim() || !d.id?.trim()) return null
    return d
  }

  protected normalize(parsed: unknown): NormalizedOpportunity | null {
    const d = parsed as BonfireRecord

    const title = (d.title ?? '').trim()
    if (!title || !d.close_date) return null

    return {
      external_id:             `hc-${d.id}`,
      source_slug:             'harris-county',
      source_name:             'Harris County',
      source_url:              'https://harriscounty.bonfirehub.com',
      title,
      agency:                  d.department ?? 'Harris County',
      location:                'Houston, TX',
      state:                   'TX',
      due_date:                d.close_date,
      posted_date:             d.published_date || undefined,
      value_min:               d.estimated_value_min,
      value_max:               d.estimated_value_max,
      description:             d.description ?? title,
      requirements:            [],
      naics_codes:             d.commodity_codes ?? [],
      certifications_required: [],
      solicitation_number:     d.id,
      raw_data:                d as unknown as Record<string, unknown>,
    }
  }
}

export const harrisCounty = new HarrisCountyConnector()
