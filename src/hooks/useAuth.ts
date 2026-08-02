import { useEffect, useRef, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, SaveSlot, isSupabaseConfigured } from '../lib/supabase'
import { CURRENT_SCHEMA } from './useGameStore'

export function useAuth() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // OAuth 失敗時 Supabase 會把錯誤帶在轉址網址上（hash 或 query），
    // 不顯示的話玩家只會看到「默默跳回登入頁」，無從除錯
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const queryParams = new URLSearchParams(window.location.search)
    const errDesc =
      hashParams.get('error_description') || queryParams.get('error_description') ||
      hashParams.get('error') || queryParams.get('error')
    if (errDesc) {
      setAuthError(decodeURIComponent(errDesc.replace(/\+/g, ' ')))
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data.session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleGoogleLogin = async () => {
    setAuthError(null)
    if (!supabase) {
      alert(
        'Supabase 尚未設定，無法登入。\n\n請在專案根目錄建立 .env.local，填入：\nVITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...\n\n設定完成後請重新啟動 dev server。'
      )
      return
    }

    // GitHub Pages 部署在子路徑（/NewWorld/），origin 會丟失路徑導致登入後 404，
    // 需帶上 BASE_URL 完整路徑
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
  }

  const handleLogout = async () => {
    if (!supabase) return

    await supabase.auth.signOut()
    setAuthUser(null)
  }

  // 髒標記（dirty flag）：記錄每個存檔槽最後成功上傳內容的雜湊，
  // 快照未變更時跳過整包 JSON 上傳（例如節流自動存檔在無變更回合觸發）
  const lastSavedHashRef = useRef<Record<string, string>>({})

  const hashSnapshot = (json: string): string => {
    let h = 5381
    for (let i = 0; i < json.length; i++) {
      h = ((h << 5) + h + json.charCodeAt(i)) | 0
    }
    return `${json.length}:${h}`
  }

  const saveToCloud = async (
    userId: string,
    slotName: string,
    data: object
  ): Promise<boolean> => {
    if (!supabase) return false

    const key = `${userId}/${slotName}`
    const hash = hashSnapshot(JSON.stringify(data))
    if (lastSavedHashRef.current[key] === hash) return true // 未變更，跳過上傳

    const { error } = await supabase.from('saves').upsert({
      user_id: userId,
      slot_name: slotName,
      save_data: data,
      schema_version: CURRENT_SCHEMA,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,slot_name' })

    if (error) console.error('[saveToCloud] ERROR:', JSON.stringify(error))
    else lastSavedHashRef.current[key] = hash
    return !error
  }

  const loadFromCloud = async (
    userId: string,
    slotName: string
  ): Promise<Record<string, unknown> | null> => {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('saves')
      .select('save_data, schema_version')
      .eq('user_id', userId)
      .eq('slot_name', slotName)
      .maybeSingle()

    if (error) console.error('[loadFromCloud] ERROR:', JSON.stringify(error))
    if (!data) return null

    return data.save_data as Record<string, unknown>
  }

  const listCloudSaves = async (userId: string): Promise<SaveSlot[]> => {
    if (!supabase) return []

    // 不取 save_data：列清單只用到名稱與時間，整包存檔（可能數 MB）
    // 由 loadFromCloud 針對單一槽單獨取得
    const { data, error } = await supabase
      .from('saves')
      .select('id, slot_name, schema_version, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) console.error('[listCloudSaves] ERROR:', JSON.stringify(error))
    return data ?? []
  }

  const deleteCloudSave = async (userId: string, slotName: string): Promise<boolean> => {
    if (!supabase) return false

    const { error } = await supabase
      .from('saves')
      .delete()
      .eq('user_id', userId)
      .eq('slot_name', slotName)

    if (error) console.error('[deleteCloudSave] ERROR:', JSON.stringify(error))
    else delete lastSavedHashRef.current[`${userId}/${slotName}`]
    return !error
  }

  return {
    authUser,
    authLoading,
    authError,
    handleGoogleLogin,
    handleLogout,
    saveToCloud,
    loadFromCloud,
    listCloudSaves,
    deleteCloudSave,
    isSupabaseConfigured,
  }
}
