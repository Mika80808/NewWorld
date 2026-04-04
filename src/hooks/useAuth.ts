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

  const saveToCloud = async (
    userId: string,
    slotName: string,
    data: object
  ): Promise<boolean> => {
    console.log('[saveToCloud] userId:', userId, 'slot:', slotName)
    const { error } = await supabase.from('saves').upsert({
      user_id: userId,
      slot_name: slotName,
      save_data: data,
      schema_version: CURRENT_SCHEMA,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,slot_name' })
    if (error) console.error('[saveToCloud] ERROR:', JSON.stringify(error))
    else console.log('[saveToCloud] OK')
    return !error
  }

  const loadFromCloud = async (
    userId: string,
    slotName: string
  ): Promise<Record<string, unknown> | null> => {
    console.log('[loadFromCloud] userId:', userId, 'slot:', slotName)
    const { data, error } = await supabase
      .from('saves')
      .select('save_data, schema_version')
      .eq('user_id', userId)
      .eq('slot_name', slotName)
      .single()
    if (error) console.error('[loadFromCloud] ERROR:', JSON.stringify(error))
    else console.log('[loadFromCloud] OK, schema_version:', data?.schema_version)
    if (error || !data) return null
    return data.save_data as Record<string, unknown>
  }

  const listCloudSaves = async (userId: string): Promise<SaveSlot[]> => {
    console.log('[listCloudSaves] userId:', userId)
    const { data, error } = await supabase
      .from('saves')
      .select('id, slot_name, save_data, schema_version, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) console.error('[listCloudSaves] ERROR:', JSON.stringify(error))
    else console.log('[listCloudSaves] slots:', data?.map(s => s.slot_name))
    return data ?? []
  }

  const deleteCloudSave = async (userId: string, slotName: string): Promise<boolean> => {
    console.log('[deleteCloudSave] userId:', userId, 'slot:', slotName)
    const { error } = await supabase
      .from('saves')
      .delete()
      .eq('user_id', userId)
      .eq('slot_name', slotName)
    if (error) console.error('[deleteCloudSave] ERROR:', JSON.stringify(error))
    else console.log('[deleteCloudSave] OK')
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
