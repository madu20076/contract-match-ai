export interface BusinessProfile {
  id?: string
  business_name: string
  industry: string
  naics_codes: string[]
  fsc_codes: string[]
  nsn_interest: string[]
  keywords: string[]
  city: string
  state: string
  service_radius: number
  certifications: string[]
  years_in_business: number
  past_government_experience: boolean
  email: string
  created_at?: string
}

export interface Contract {
  id: string
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
  source_name?: string
  source_url?: string
  solicitation_number?: string
  posted_date?: string
  created_at?: string
}

export interface ContractMatch {
  id: string
  business_profile_id: string
  contract_id: string
  match_score: number
  match_reasons: string[]
  suggested_next_steps: string[]
  created_at?: string
  contract?: Contract
}

export interface ContractAnalysis {
  id?: string
  contract_id: string
  business_profile_id?: string
  fit_score: number               // 0-100
  win_probability: number         // 0-100
  risk_level: 'low' | 'medium' | 'high'
  proposal_effort: 'low' | 'medium' | 'high' | 'very_high'
  executive_summary: string
  why_it_matches: string[]
  risks: string[]
  missing_requirements: string[]
  recommended_next_steps: string[]
  questions_for_contracting_officer: string[]
  ai_model?: string
  is_ai_generated: boolean
  created_at?: string
}

export interface OpportunityBrief {
  id?: string
  contract_id: string
  summary: string
  opportunity_type: string
  estimated_contract_size: string
  fit_score: number
  win_probability: number
  proposal_complexity: 'low' | 'medium' | 'high' | 'very_high'
  competition_level: 'low' | 'medium' | 'high'
  required_certifications: string[]
  required_documents: string[]
  key_requirements: string[]
  risks: string[]
  recommended_actions: string[]
  timeline: Record<string, string>
  generated_by: string
  generated_at?: string
  updated_at?: string
}

export interface ProposalStrategy {
  id?: string
  contract_id: string
  business_profile_id: string
  recommendation: 'GO' | 'NO-GO' | 'CONDITIONAL'
  confidence_score: number
  strengths: string[]
  weaknesses: string[]
  required_documents: string[]
  evaluation_factors: Record<string, string>
  pricing_guidance: string
  teaming_recommendations: string[]
  timeline: Record<string, string>
  next_steps: string[]
  generated_by: string
  created_at?: string
  updated_at?: string
}

export type Database = {
  public: {
    Tables: {
      business_profiles: {
        Row: BusinessProfile & { id: string; created_at: string }
        Insert: Omit<BusinessProfile, 'id' | 'created_at'>
        Update: Partial<BusinessProfile>
      }
      contracts: {
        Row: Contract & { created_at: string }
        Insert: Omit<Contract, 'id' | 'created_at'>
        Update: Partial<Contract>
      }
      contract_matches: {
        Row: ContractMatch & { created_at: string }
        Insert: Omit<ContractMatch, 'id' | 'created_at'>
        Update: Partial<ContractMatch>
      }
    }
  }
}
