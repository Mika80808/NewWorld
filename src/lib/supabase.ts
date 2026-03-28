import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const meta = import.meta as any
const supabaseUrl = (meta.env?.VITE_SUPABASE_URL ?? '') as string
const supabaseAnonKey = (meta.env?.VITE_SUPABASE_ANON_KEY ?? '') as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type SaveSlot = {
  id: string
  slot_name: string
  save_data: Record<string, unknown>
  schema_version: number
  updated_at: string
}
