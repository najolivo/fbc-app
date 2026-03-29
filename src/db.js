import { createClient } from '@supabase/supabase-js'

// ─── Supabase Client ─────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null

export const isSupabase = !!supabase

// ─── Storage Layer ───────────────────────────────────────────────────────────
// Uses Supabase when configured, falls back to localStorage for testing.
// This means you can deploy and test immediately without Supabase,
// then add env vars when you're ready for shared team access.

// ── Submissions ──────────────────────────────────────────────────────────────
export async function getSubs() {
  if (supabase) {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('timestamp', { ascending: false })
    if (error) { console.error('getSubs error:', error); return [] }
    // Parse JSONB fields
    return data.map(d => ({
      ...d,
      tags: typeof d.tags === 'string' ? JSON.parse(d.tags) : (d.tags || []),
      reactions: typeof d.reactions === 'string' ? JSON.parse(d.reactions) : (d.reactions || {}),
    }))
  }
  try { return JSON.parse(localStorage.getItem('fbc-subs') || '[]') } catch { return [] }
}

export async function saveSub(sub) {
  if (supabase) {
    const row = {
      ...sub,
      tags: JSON.stringify(sub.tags),
      reactions: JSON.stringify(sub.reactions),
    }
    const { error } = await supabase.from('submissions').upsert(row, { onConflict: 'id' })
    if (error) console.error('saveSub error:', error)
    return
  }
  const all = await getSubs()
  const idx = all.findIndex(s => s.id === sub.id)
  if (idx >= 0) all[idx] = sub; else all.unshift(sub)
  localStorage.setItem('fbc-subs', JSON.stringify(all))
}

export async function deleteSub(id) {
  if (supabase) {
    const { error } = await supabase.from('submissions').delete().eq('id', id)
    if (error) console.error('deleteSub error:', error)
    return
  }
  const all = await getSubs()
  localStorage.setItem('fbc-subs', JSON.stringify(all.filter(s => s.id !== id)))
}

export async function updateSubReactions(id, reactions) {
  if (supabase) {
    const { error } = await supabase
      .from('submissions')
      .update({ reactions: JSON.stringify(reactions) })
      .eq('id', id)
    if (error) console.error('updateReactions error:', error)
    return
  }
  const all = await getSubs()
  const sub = all.find(s => s.id === id)
  if (sub) { sub.reactions = reactions; localStorage.setItem('fbc-subs', JSON.stringify(all)) }
}

// ── Users ────────────────────────────────────────────────────────────────────
export async function getUsers() {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*')
    if (error) { console.error('getUsers error:', error); return [] }
    return data.map(u => ({
      ...u,
      favGenres: typeof u.favGenres === 'string' ? JSON.parse(u.favGenres) : (u.favGenres || []),
    }))
  }
  try { return JSON.parse(localStorage.getItem('fbc-users') || '[]') } catch { return [] }
}

export async function saveUser(user) {
  if (supabase) {
    const { error } = await supabase.from('users').upsert(user, { onConflict: 'name' })
    if (error) console.error('saveUser error:', error)
    return
  }
  const all = await getUsers()
  if (!all.find(u => u.name === user.name)) all.push(user)
  localStorage.setItem('fbc-users', JSON.stringify(all))
}

// ── Config ───────────────────────────────────────────────────────────────────
export async function getConfig() {
  if (supabase) {
    const { data, error } = await supabase.from('config').select('*').eq('id', 'main').single()
    if (error) { console.error('getConfig error:', error); return null }
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  }
  try { return JSON.parse(localStorage.getItem('fbc-config') || 'null') } catch { return null }
}

export async function saveConfig(cfg) {
  if (supabase) {
    const { error } = await supabase
      .from('config')
      .upsert({ id: 'main', value: JSON.stringify(cfg) }, { onConflict: 'id' })
    if (error) console.error('saveConfig error:', error)
    return
  }
  localStorage.setItem('fbc-config', JSON.stringify(cfg))
}

// ── Changelog ────────────────────────────────────────────────────────────────
export async function getLog() {
  if (supabase) {
    const { data, error } = await supabase
      .from('changelog')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100)
    if (error) { console.error('getLog error:', error); return [] }
    return data
  }
  try { return JSON.parse(localStorage.getItem('fbc-log') || '[]') } catch { return [] }
}

export async function addLogEntry(entry) {
  if (supabase) {
    const { error } = await supabase.from('changelog').insert(entry)
    if (error) console.error('addLog error:', error)
    return
  }
  const all = await getLog()
  all.unshift(entry)
  localStorage.setItem('fbc-log', JSON.stringify(all))
}

// ── Session ──────────────────────────────────────────────────────────────────
// Always localStorage — session is per-browser
export function getSession() {
  try { return JSON.parse(localStorage.getItem('fbc-session') || 'null') } catch { return null }
}
export function saveSession(s) {
  localStorage.setItem('fbc-session', JSON.stringify(s))
}

// ── Reaction Image Upload ────────────────────────────────────────────────────
// Uploads an image to Supabase Storage and returns the public URL
export async function uploadReactionImage(file) {
  if (!supabase) {
    // Fallback: convert to data URL for local testing
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Sanitize filename and make unique
  const ext = file.name.split('.').pop().toLowerCase()
  const safeName = `reaction_${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`

  const { data, error } = await supabase.storage
    .from('reactions')
    .upload(safeName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) {
    console.error('Upload error:', error)
    throw error
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('reactions')
    .getPublicUrl(data.path)

  return urlData.publicUrl
}

export async function deleteReactionImage(url) {
  if (!supabase || !url.includes('supabase')) return
  const match = url.match(/reactions\/(.+)$/)
  if (match) {
    const { error } = await supabase.storage.from('reactions').remove([match[1]])
    if (error) console.error('Delete image error:', error)
  }
}

// ── Profile Pictures ─────────────────────────────────────────────────────────
export async function uploadProfilePic(file, userName) {
  if (!supabase) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }
  const ext = file.name.split('.').pop().toLowerCase()
  const safeName = `profile_${userName.replace(/[^a-z0-9]/gi,'_')}_${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from('reactions')  // reuse same bucket
    .upload(safeName, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('reactions').getPublicUrl(data.path)
  return urlData.publicUrl
}

export async function updateUserProfile(name, updates) {
  if (supabase) {
    const { error } = await supabase.from('users').update(updates).eq('name', name)
    if (error) console.error('updateProfile error:', error)
    return
  }
  const all = await getUsers()
  const u = all.find(u => u.name === name)
  if (u) { Object.assign(u, updates); localStorage.setItem('fbc-users', JSON.stringify(all)) }
}
