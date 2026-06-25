import { ProcurementConnector } from '../connector'
import type { FetchOptions, SourceType } from '../connector'
import type { NormalizedOpportunity } from '../normalizer'

// Texas SmartBuy / Electronic State Business Daily (ESBD)
// Portal: https://www.txsmartbuy.com/esbd
// Real integration requires TEXAS_ESBD_API_KEY registration.

interface EsbdRecord {
  bid_id:               string
  title:                string
  agency:               string
  city:                 string
  due_date:             string
  open_date:            string
  class_code:           string
  description:          string
  estimated_value_min?: number
  estimated_value_max?: number
  set_aside?:           string
}

const MOCK_TEXAS: EsbdRecord[] = [
  {
    bid_id: 'TX-2026-0441', title: 'Road Maintenance Equipment Rental',
    agency: 'Texas Dept of Transportation', city: 'Austin',
    due_date: '2026-07-18', open_date: '2026-06-10', class_code: '532412',
    description: 'Heavy equipment rental for road maintenance statewide — motor graders, rollers, and dump trucks. Short-term and long-term agreements.',
    estimated_value_min: 100000, estimated_value_max: 400000, set_aside: 'HUB',
  },
  {
    bid_id: 'TX-2026-0558', title: 'Fleet Fuel Card Services — Statewide',
    agency: 'Texas Facilities Commission', city: 'Austin',
    due_date: '2026-08-12', open_date: '2026-06-20', class_code: '541614',
    description: 'Fuel card services for state fleet vehicles across all Texas agencies. Includes reporting, fraud controls, and pump-side data capture.',
    estimated_value_min: 500000, estimated_value_max: 2000000,
  },
  {
    bid_id: 'TX-2026-0302', title: 'IT Staffing and Professional Services',
    agency: 'Texas Dept of Information Resources', city: 'Austin',
    due_date: '2026-07-05', open_date: '2026-06-05', class_code: '541512',
    description: 'Technology staffing and professional services for state agencies — software development, project management, and cybersecurity roles.',
    estimated_value_min: 250000, estimated_value_max: 1000000, set_aside: 'HUB',
  },
  {
    bid_id: 'TX-2026-0619', title: 'Janitorial Services — State Office Buildings',
    agency: 'Texas Facilities Commission', city: 'Austin',
    due_date: '2026-09-01', open_date: '2026-06-22', class_code: '561720',
    description: 'Janitorial and facility cleaning for 22 state office buildings in the Austin metro area. Multi-year contract with annual renewals.',
    estimated_value_min: 200000, estimated_value_max: 800000,
  },
]

const HUB_MAP: Record<string, string[]> = {
  HUB: ['MBE', 'DBE'],
  MBE: ['MBE'],
  WBE: ['WOSB'],
}

class TexasConnector extends ProcurementConnector {
  readonly slug = 'texas'
  readonly name = 'Texas SmartBuy'
  readonly type: SourceType = 'state'

  protected async fetch(options?: FetchOptions): Promise<EsbdRecord[]> {
    if (!process.env.TEXAS_ESBD_API_KEY) {
      const cutoff = options?.since ?? new Date(Date.now() - 7 * 86_400_000)
      return MOCK_TEXAS.filter((r) => new Date(r.open_date) >= cutoff)
    }

    const apiKey  = process.env.TEXAS_ESBD_API_KEY
    const since   = options?.since
    const sinceStr = since ? since.toISOString().split('T')[0] : ''
    const qs = new URLSearchParams({ api_key: apiKey, ...(sinceStr && { since: sinceStr }) })

    const res = await fetch(`https://api.txsmartbuy.com/esbd/v1/bids?${qs}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Texas ESBD API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return (await res.json()) as EsbdRecord[]
  }

  protected parse(raw: unknown): EsbdRecord | null {
    const d = raw as EsbdRecord
    if (!d.title?.trim() || !d.bid_id?.trim()) return null
    return d
  }

  protected normalize(parsed: unknown): NormalizedOpportunity | null {
    const d = parsed as EsbdRecord

    const title = (d.title ?? '').trim()
    if (!title || !d.due_date) return null

    const setAside = (d.set_aside ?? '').toUpperCase()

    return {
      external_id:             `tx-${d.bid_id}`,
      source_slug:             'texas',
      source_name:             'Texas SmartBuy',
      source_url:              'https://www.txsmartbuy.com/esbd',
      title,
      agency:                  d.agency ?? 'Texas State Agency',
      location:                d.city ? `${d.city}, TX` : 'Texas',
      state:                   'TX',
      due_date:                d.due_date,
      posted_date:             d.open_date || undefined,
      value_min:               d.estimated_value_min,
      value_max:               d.estimated_value_max,
      description:             d.description ?? title,
      requirements:            [],
      naics_codes:             d.class_code ? [d.class_code] : [],
      certifications_required: HUB_MAP[setAside] ?? [],
      set_aside:               setAside || undefined,
      solicitation_number:     d.bid_id ? `TX-${d.bid_id}` : undefined,
      raw_data:                d as unknown as Record<string, unknown>,
    }
  }
}

export const texas = new TexasConnector()
