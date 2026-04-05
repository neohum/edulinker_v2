export interface Sendoc {
  id: string
  title: string
  status: string
  background_url: string
  fields_json: string
  created_at: string
  author?: { name: string }
}

export interface PendingDoc extends Sendoc {
  is_signed: boolean
  signed_at?: string
  signature_image_url?: string
  form_data_json?: string
  recipient_id?: string
}

export interface DocField {
  id: string
  type: 'text' | 'signature'
  x: number
  y: number
  width: number
  height: number
  label: string
  value?: string
  signatureData?: string
  fontSize?: number
}

export interface RecipientStatus {
  id: string
  user: { name: string; role: string; grade: number; class_num: number; number: number }
  is_signed: boolean
  signed_at: string
  signature_image_url: string
  form_data_json?: string
}

export interface Point { x: number; y: number }
export interface Stroke { points: Point[]; size: number; isEraser: boolean }
