import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, SaveSlot, isSupabaseConfigured } from '../lib/supabase'
import { CURRENT_SCHEMA } from './useGameStore'

export function useAuth() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)

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

  const saveToCloud = async (
    userId: string,
    slotName: string,
    data: object
  ): Promise<boolean> => {
    if (!supabase) return false

    const { error } = await supabase.from('saves').upsert({
      user_id: userId,
      slot_name: slotName,
      save_data: data,
      schema_version: CURRENT_SCHEMA,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,slot_name' })

    if (error) console.error('[saveToCloud] ERROR:', JSON.stringify(error))
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

    const { data, error } = await supabase
      .from('saves')
      .select('id, slot_name, save_data, schema_version, updated_at')
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
    return !error
  }

  return {
    authUser,
    authLoading,
    handleGoogleLogin,
    handleLogout,
    saveToCloud,
    loadFromCloud,
    listCloudSaves,
    deleteCloudSave,
    isSupabaseConfigured,
  }
}
