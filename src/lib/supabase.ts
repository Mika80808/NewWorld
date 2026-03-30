import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type SaveSlot = {
  id: string
  slot_name: string
  save_data: Record<string, unknown>
  schema_version: number
  updated_at: string
}
