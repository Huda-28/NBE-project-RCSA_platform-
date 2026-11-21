/**
 * Types & Domain Interfaces for NBE RCSA Enterprise Platform
 * Conforming to CBE Operational Risk Guidelines & NBE Methodology
 */

export type UserRole = 'MAKER' | 'CHECKER' | 'RISK_ADMIN' | 'AUDITOR';

export interface BusinessUnit {
  id: string;
  name_ar: string;
  name_en: string;
  code: string;
  description?: string;
  total_risks_count?: number;
  open_actions_count?: number;
  latest_approved_date?: string;
  created_at: string;
}

export interface UserBURole {
  id: string;
  user_id: string;
  unit_id: string;
  role: UserRole;
  unit_name_ar?: string;
  granted_at: string;
  granted_by?: string;
}

export interface User {
  employee_id: string;
  full_name: string;
  email: string;
  must_reset_password: boolean;
  is_active: boolean;
  created_at: string;
  roles: UserBURole[];
}

export interface AuthSession {
  token: string;
  user: User;
}

export type AssessmentStatus = 
  | 'INCOMPLETE_DRAFT' 
  | 'READY_DRAFT' 
  | 'SUBMITTED' 
  | 'APPROVED' 
  | 'REJECTED';

export type AssessmentSource = 
  | 'BACKEND_GUIDED' 
  | 'AI_AGENT' 
  | 'MANUAL_OFFLINE';

export interface RCSAssessment {
  id: string;
  unit_id: string;
  unit_name_ar?: string;
  cycle_year: number;
  title: string;
  workflow_source: AssessmentSource;
  status: AssessmentStatus;
  version_number: number;
  is_latest_approved: boolean;
  created_by: string;
  creator_name?: string;
  submitted_by?: string;
  submitted_at?: string;
  approved_by?: string;
  approver_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  risks_count?: number;
  created_at: string;
  updated_at: string;
}

export interface RiskItem {
  id: string;
  risk_master_id: string;
  assessment_id: string;
  risk_code: string;
  process_name: string;
  risk_description: string;
  taxonomy_l1_id: string;
  taxonomy_l1_name_ar?: string;
  taxonomy_l2_id?: string;
  taxonomy_l2_name_ar?: string;
  taxonomy_l3_id?: string;
  taxonomy_l3_name_ar?: string;
  
  // Financial inputs (Nullable in incomplete drafts)
  financial_impact_level?: number | null; // 1 to 5
  financial_impact_amount?: number | null;
  single_incident_max_loss?: number | null;
  
  // 4 NFI dimensions (1 to 5)
  nfi_service_level?: number | null;
  nfi_reputation_level?: number | null;
  nfi_regulatory_level?: number | null;
  nfi_legal_level?: number | null;
  nfi_composite_score?: 'L' | 'M' | 'H' | 'VH' | 'NA' | null; // Z8 average formula
  
  // Methodological calculated outcomes
  final_inherent_impact_level?: number | null;
  inherent_frequency_level?: number | null;
  inherent_frequency_text?: string | null;
  expected_annual_loss?: number | null; // K8
  inherent_risk_rating?: 'L' | 'M' | 'H' | 'VH' | 'C' | null; // L8
  
  residual_loss_amount?: number | null; // T8
  residual_risk_rating?: 'L' | 'M' | 'H' | 'VH' | 'C' | null; // U8
  applied_max_rrf?: number | null;
  
  is_assessment_complete: boolean;
  rational_text?: string | null;
  created_at: string;
}

export interface ControlItem {
  id: string;
  control_code: string;
  control_description: string;
  control_type: 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE';
  control_method: 'AUTOMATED' | 'SEMI_AUTOMATED' | 'MANUAL';
  control_frequency: string;
  control_owner: string;
  raw_efficiency_rating: string;
  rrf_value: number;
  status: 'IMPLEMENTED' | 'PROPOSED' | 'VERIFIED';
}

export interface AuditEvent {
  id: number;
  ts: string;
  user_id: string;
  user_role: string;
  unit_id?: string;
  unit_name_ar?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_state?: Record<string, any> | null;
  after_state?: Record<string, any> | null;
  change_summary: string;
}

export interface DashboardSummary {
  bu_summaries: Array<{
    unit: BusinessUnit;
    latest_approved?: RCSAssessment | null;
    latest_draft?: RCSAssessment | null;
    risks_count: number;
    distribution: {
      low: number;
      medium: number;
      high: number;
      very_high: number;
    };
    last_change?: {
      author: string;
      ts: string;
      summary: string;
    };
  }>;
  overall_kpis: {
    total_approved_risks: number;
    total_active_drafts: number;
    high_critical_risks: number;
    pending_checker_reviews: number;
    open_remediation_actions: number;
  };
}
