/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { ROLES } from '../lib/roles'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadProfile = async (userId) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, department')
        .eq('id', userId)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (error) {
        setProfile(null)
        setProfileError(error.message)
        return
      }

      if (!data) {
        setProfile(null)
        setProfileError(
          'Profile not found for this account. Run the SQL setup and ensure the user has a profile row.',
        )
        return
      }

      setProfile(data)
      setProfileError('')
    }

    const syncSessionState = async (nextSession) => {
      if (!isMounted) {
        return
      }

      setSession(nextSession)

      if (!nextSession) {
        setProfile(null)
        setProfileError('')
        setLoading(false)
        return
      }

      await loadProfile(nextSession.user.id)
      setLoading(false)
    }

    const loadSession = async () => {
      const {
        data: { session: nextSession },
      } = await supabase.auth.getSession()

      await syncSessionState(nextSession ?? null)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncSessionState(nextSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithEmail = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const role = profile?.role || null

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    profileError,
    isAuthenticated: Boolean(session),
    isAdmin: role === ROLES.ADMIN,
    isManager: role === ROLES.MANAGER,
    isStaff: role === ROLES.STAFF,
    loading,
    signInWithEmail,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }

  return context
}
