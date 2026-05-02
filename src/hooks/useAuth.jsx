import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

const EDGE_URL = import.meta.env.VITE_SUPABASE_EDGE_URL || ''

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  // ── Email login ───────────────────────────────────────────
  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  // ── Username login ────────────────────────────────────────
  // Looks up auth_email by username, then signs in normally
  async function signInWithUsername(username, password) {
    const { data: p, error } = await supabase
      .from('profiles')
      .select('auth_email')
      .ilike('username', username.trim())
      .single()
    if (error || !p?.auth_email) return { error: { message: 'Username not found. Contact admin.' } }
    return signIn(p.auth_email, password)
  }

  // ── Face login ────────────────────────────────────────────
  // 1. Get a short-lived token from Supabase RPC
  // 2. Exchange it for a real session via Edge Function
  async function signInWithFaceToken(userId) {
    // Step 1 — request token (RPC)
    const { data: tokenData, error: tokenErr } = await supabase
      .rpc('request_face_login_token', { p_user_id: userId })
    if (tokenErr || !tokenData?.token) {
      return { error: { message: tokenErr?.message || 'Could not generate face token.' } }
    }

    // Step 2 — exchange token for session (Edge Function)
    try {
      const resp = await fetch(`${EDGE_URL}/face-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ token: tokenData.token, userId }),
      })
      const json = await resp.json()
      if (!resp.ok || json.error) {
        return { error: { message: json.error || 'Face session failed.' } }
      }

      // Step 3 — set the session in Supabase client
      const { data, error } = await supabase.auth.setSession({
        access_token:  json.access_token,
        refresh_token: json.refresh_token,
      })
      return { data, error }
    } catch (err) {
      return { error: { message: 'Network error: ' + err.message } }
    }
  }

  async function signOut() { await supabase.auth.signOut() }
  async function changePassword(newPassword) { return supabase.auth.updateUser({ password: newPassword }) }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signInWithUsername, signInWithFaceToken,
      signOut, fetchProfile, changePassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
