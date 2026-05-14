import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

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
  async function signInWithFaceToken(userId) {
    // Get email and face_password from face_enrollments
    const { data, error } = await supabase
      .from('face_enrollments')
      .select('face_password, profiles:user_id(auth_email)')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return { error: { message: 'Face data not found. Use password.' } }
    }

    const email = data.profiles?.auth_email
    const password = data.face_password

    if (!email || !password) {
      return { error: { message: 'Face login not configured. Use password.' } }
    }

    return supabase.auth.signInWithPassword({ email, password })
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
