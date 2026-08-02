import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// 存檔槽「清單」項目：不含 save_data。
// 列清單只需要顯示名稱與時間，整包存檔另由 loadFromCloud 單獨取得。
export type SaveSlot = {
  id: string
  slot_name: string
  schema_version: number
  updated_at: string
}
