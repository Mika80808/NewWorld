import { useEffect, useRef, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, SaveSlot, isSupabaseConfigured } from '../lib/supabase'
import { CURRENT_SCHEMA } from './useGameStore'

// ─── Dev-only 登入繞過 ────────────────────────────────────────────────────────
//
// 為什麼需要：預覽瀏覽器不允許導向 localhost 以外的網址，Google OAuth 那一關
// 在本機自動化環境下走不完。開啟後跳過登入 gate，讓 UI 可以在本機被實際檢視。
//
// 安全性（兩道鎖）：
//   1. import.meta.env.DEV —— production build 時是編譯期常數 false，
//      整個分支連同假 user 都會被 tree-shake 掉，不可能隨 build 上線
//   2. VITE_DEV_SKIP_AUTH —— 必須在 .env.local 明確開啟（該檔已被 gitignore）
//
// 所有雲端 CRUD 在此模式下一律 no-op：不讀、不寫、不刪正式 Supabase 存檔。
// 要用真實資料檢視 UI 時，直接在畫面上用「系統 → 存檔匯入」載入匯出的 JSON。
// ⚠️ 匯入的內容只存在記憶體：saveToCloud 是 no-op，重新整理後會回到全新遊戲。
// 代價是驗不到 auth 與雲端存檔本身，那兩者只能用真實登入驗證。
const DEV_SKIP_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_AUTH === 'true'

const DEV_FAKE_USER = {
  id: 'dev-local-user',
  email: 'dev@localhost',
  user_metadata: { full_name: '本機開發者' },
} as unknown as User

// OAuth 失敗時 Supabase 會把錯誤帶在轉址網址上（hash 或 query），
// 不顯示的話玩家只會看到「默默跳回登入頁」，無從除錯
function readOAuthError(): string | null {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const queryParams = new URLSearchParams(window.location.search)
  const errDesc =
    hashParams.get('error_description') || queryParams.get('error_description') ||
    hashParams.get('error') || queryParams.get('error')
  return errDesc ? decodeURIComponent(errDesc.replace(/\+/g, ' ')) : null
}

export function useAuth() {
  const [authUser, setAuthUser] = useState<User | null>(DEV_SKIP_AUTH ? DEV_FAKE_USER : null)
  const [authLoading, setAuthLoading] = useState(DEV_SKIP_AUTH ? false : isSupabaseConfigured)
  // 直接用初始值讀取，不再 effect 內 setState：錯誤訊息在第一次 render 就在位，
  // 少一次「先畫沒有錯誤的登入頁、再補上錯誤」的閃動
  const [authError, setAuthError] = useState<string | null>(readOAuthError)

  useEffect(() => {
    // 網址清理留在 effect（DOM 副作用）。重新讀一次而不是看 authError，
    // 是為了避免把 deps 綁上會被使用者操作改變的 state。
    // ⚠️ 只在「確實有錯誤」時清網址：OAuth 成功時 hash 帶的是 token，
    // 提早抹掉會讓 supabase.auth 讀不到而登入失敗
    if (readOAuthError()) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (DEV_SKIP_AUTH) return
    // 沒設定 Supabase 時 authLoading 的初始值已經是 false
    //（初始值就是 isSupabaseConfigured，而 supabase === null 等價於它為 false），
    // 這裡不必再 setState 一次
    if (!supabase) return

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
    if (DEV_SKIP_AUTH) return true   // 假裝成功，不寫入正式存檔
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
    if (DEV_SKIP_AUTH) return null   // 一律當成無存檔，走全新遊戲流程
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
    if (DEV_SKIP_AUTH) return []
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
    if (DEV_SKIP_AUTH) return true
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
