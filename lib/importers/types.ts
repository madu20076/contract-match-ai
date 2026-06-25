export type SourceType = 'federal' | 'state' | 'city' | 'county'
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface RawContract {
  external_id: string
  raw_data: Record<string, unknown>
}

export interface NormalizedContract {
  title: string
  agency: string
  location: string
  state: string
  due_date: string
  value_min?: number
  value_max?: number
  description: string
  requirements: string[]
  naics_codes: string[]
  certifications_required: string[]
  fsc_codes?: string[]
  nsn?: string
  solicitation_type?: string
  set_aside?: string
  source_name?: string
  source_url?: string
  solicitation_number?: string
  posted_date?: string
  external_id: string
  source_slug: string
  raw_data: Record<string, unknown>
}

// Optional filters passed to fetchRaw — only SAM.gov uses these today
export interface ImportFilters {
  naicsCode?: string   // e.g. "541512"
  agency?: string      // dept name substring, e.g. "Veterans Affairs"
  setAside?: string    // SAM code: 8AN, HZC, WOSB, SDVOSBC, VSB, SBA, OOSP …
  postedFrom?: string  // yyyy-mm-dd
  postedTo?: string    // yyyy-mm-dd
  keyword?: string
}

export interface ImportResult {
  source_slug: string
  source_name: string
  contracts_found: number
  contracts_inserted: number
  contracts_updated: number
  skipped: number
  errors: string[]
  duration_ms: number
  filters_applied?: boolean
}

export interface SourceConnector {
  slug: string
  name: string
  type: SourceType
  isConfigured(): boolean
  // filters is optional — connectors that don't support it may ignore the second param
  fetchRaw(since?: Date, filters?: ImportFilters): Promise<RawContract[]>
  normalize(raw: RawContract): NormalizedContract | null
}
