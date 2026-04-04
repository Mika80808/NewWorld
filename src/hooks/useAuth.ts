import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, SaveSlot } from '../lib/supabase'
import { CURRENT_SCHEMA } from './useGameStore'

export function useAuth() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
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
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
  }

  // 儲存至雲端（upsert）
  const saveToCloud = async (
    userId: string,
    slotName: string,
    data: object
  ): Promise<boolean> => {
    const { error } = await supabase.from('saves').upsert({
      user_id: userId,
      slot_name: slotName,
      save_data: data,
      schema_version: CURRENT_SCHEMA,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,slot_name' })
    if (error) console.error('[saveToCloud] ERROR:', JSON.stringify(error))
    return !error
  }

  // 從雲端讀取單一存檔槽（maybeSingle：查無資料回 null，不報 PGRST116）
  const loadFromCloud = async (
    userId: string,
    slotName: string
  ): Promise<Record<string, unknown> | null> => {
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

  // 列出所有存檔槽
  const listCloudSaves = async (userId: string): Promise<SaveSlot[]> => {
    const { data, error } = await supabase
      .from('saves')
      .select('id, slot_name, save_data, schema_version, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) console.error('[listCloudSaves] ERROR:', JSON.stringify(error))
    return data ?? []
  }

  // 刪除存檔槽
  const deleteCloudSave = async (userId: string, slotName: string): Promise<boolean> => {
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
  }
}
