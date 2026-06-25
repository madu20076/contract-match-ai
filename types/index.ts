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

export interface ProposalWorkspace {
  id: string
  contract_id: string
  business_profile_id: string
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
  contract?: Contract
}

export interface ProposalTask {
  id: string
  workspace_id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  due_date?: string
  section: string
  priority: 'low' | 'medium' | 'high'
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProposalDocument {
  id: string
  workspace_id: string
  name: string
  file_path: string
  file_size?: number
  mime_type?: string
  uploaded_by?: string
  created_at: string
}

export interface ProposalNote {
  id: string
  workspace_id: string
  content: string
  created_at: string
  updated_at: string
}

export type SectionType =
  | 'executive_summary'
  | 'technical_approach'
  | 'management_plan'
  | 'staffing_plan'
  | 'quality_control'
  | 'past_performance'
  | 'pricing_narrative'
  | 'cover_letter'
  | 'compliance_matrix'

export interface ProposalSection {
  id: string
  workspace_id: string
  section_type: SectionType
  title: string
  content: string
  status: 'draft' | 'review' | 'final'
  generated_by: string
  created_at: string
  updated_at: string
}

export interface RFPDocument {
  id: string
  workspace_id: string
  file_name: string
  file_path: string
  file_size?: number
  mime_type?: string
  extracted_text?: string
  parsed_at?: string
  created_at: string
}

export type RFPRequirementType =
  | 'mandatory'
  | 'evaluation_factor'
  | 'deliverable'
  | 'certification'
  | 'clin'
  | 'attachment'
  | 'date_milestone'
  | 'technical'
  | 'management'

export interface RFPRequirement {
  id: string
  rfp_document_id: string
  workspace_id: string
  requirement_type: RFPRequirementType
  text: string
  source_section?: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  is_compliant?: boolean
  sort_order: number
  created_at: string
}

export interface ComplianceItem {
  id: string
  workspace_id: string
  rfp_requirement_id?: string
  proposal_section_id?: string
  section_type?: string
  requirement_text: string
  compliance_status: 'compliant' | 'partial' | 'not_addressed' | 'exception'
  notes?: string
  created_at: string
  updated_at: string
}

export interface ProposalReadiness {
  id: string
  workspace_id: string
  overall_score: number
  sections_score: number
  compliance_score: number
  completeness_score: number
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  red_flags: string[]
  action_items: string[]
  generated_at: string
}

export interface RFPAmendment {
  id: string
  rfp_document_id: string
  workspace_id: string
  amendment_number: string
  issued_date?: string
  due_date_change?: string
  changes: string[]
  created_at: string
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
