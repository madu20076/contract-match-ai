export interface ImportFilters {
  naicsCode?:  string
  agency?:     string
  setAside?:   string
  postedFrom?: string  // yyyy-mm-dd
  postedTo?:   string  // yyyy-mm-dd
  keyword?:    string
}

export interface NormalizedOpportunity {
  // Source identity — stripped before DB insert; used for dedup key
  external_id:               string
  source_slug:               string

  // DB columns
  source_name:               string
  source_url?:               string
  title:                     string
  agency:                    string
  location:                  string
  state:                     string
  due_date:                  string
  posted_date?:              string
  value_min?:                number
  value_max?:                number
  description:               string
  requirements:              string[]
  naics_codes:               string[]
  fsc_codes?:                string[]
  nsn?:                      string
  solicitation_type?:        string
  set_aside?:                string
  certifications_required:   string[]
  solicitation_number?:      string
  raw_data:                  Record<string, unknown>
}
