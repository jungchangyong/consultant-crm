export type ClientStatus = '상담대기' | '상담중' | '준비중' | '신청중' | '인증완료' | '운영중';
export type UserRole = 'admin' | 'consultant' | 'client';
export type ConsultationType = '방문' | '전화' | '온라인' | '이메일';
export type DocumentCategory = '신청서류' | '계약서' | '인증서류' | '보고서' | '기타';
export type DocumentStatus = '준비중' | '제출완료' | '승인' | '반려';
export type BenefitType = '무상지원금' | '세제혜택' | '고용장려금' | '운영지원' | '기타';
export type BenefitStatus = '미신청' | '신청중' | '승인' | '수령완료' | '반려';

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  phone: string | null;
  client_id: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  business_number: string | null;
  ceo_name: string | null;
  industry: string | null;
  employee_count: number | null;
  disabled_employee_count: number | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  address: string | null;
  status: ClientStatus;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  assigned_profile?: Profile;
}

export interface Consultation {
  id: string;
  client_id: string;
  consultant_id: string;
  type: ConsultationType;
  scheduled_at: string;
  completed_at: string | null;
  duration_minutes: number | null;
  summary: string | null;
  next_action: string | null;
  created_at: string;
  // joined
  client?: Pick<Client, 'id' | 'company_name'>;
  consultant?: Pick<Profile, 'id' | 'name'>;
}

export interface Document {
  id: string;
  client_id: string;
  name: string;
  category: DocumentCategory;
  file_path: string | null;
  file_size: number | null;
  status: DocumentStatus;
  due_date: string | null;
  submitted_at: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Benefit {
  id: string;
  client_id: string;
  type: BenefitType;
  name: string;
  amount: number | null;
  status: BenefitStatus;
  applied_at: string | null;
  approved_at: string | null;
  received_at: string | null;
  deadline: string | null;
  notes: string | null;
  created_at: string;
}
