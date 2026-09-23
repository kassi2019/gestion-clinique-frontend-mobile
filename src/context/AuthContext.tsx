import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import http, { setOnUnauthorized } from '../api/http'

type Module = { code: string; lecture: boolean; ecriture: boolean; validation: boolean }

type User = {
  id: number
  matricule: string
  clinique?: { id: number; nom: string; adresse?: string }
  personnel?: { nom: string; prenom: string; photo?: string; service?: { code: string; nom: string } }
  role?: { code: string; nom: string; modules?: Module[] }
}

type AuthContextType = {
  token: string | null
  user: User | null
  loading: boolean
  login: (matricule: string, motDePasse: string) => Promise<void>
  logout: () => Promise<void>
  canAccess: (moduleCode: string) => boolean
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  canAccess: () => true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem('token'),
          AsyncStorage.getItem('user'),
        ])
        if (t) setToken(t)
        if (u) setUser(JSON.parse(u))
      } catch {
        /* session vide */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Un 401 (jeton expiré) provoque une vraie déconnexion visuelle.
  useEffect(() => {
    setOnUnauthorized(() => {
      logout()
    })
    return () => setOnUnauthorized(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(matricule: string, motDePasse: string) {
    const { data } = await http.post('/auth/login', { matricule, motDePasse })
    setToken(data.access_token)
    setUser(data.user)
    await AsyncStorage.multiSet([
      ['token', data.access_token],
      ['user', JSON.stringify(data.user)],
    ])
  }

  async function logout() {
    // Comme le web : un médecin qui se déconnecte devient INDISPONIBLE
    // (sinon le heartbeat mettrait 2 min à le retirer de la file).
    if (user?.role?.code === 'MEDECIN') {
      try {
        await http.put('/consultations/disponibilite', { disponibilite: 'INDISPONIBLE' })
      } catch {
        /* silencieux : la déconnexion locale prime */
      }
    }
    setToken(null)
    setUser(null)
    await AsyncStorage.multiRemove(['token', 'user'])
  }

  /** Même règle que le web : accès si le rôle a le module (ou aucun module restreint). */
  function canAccess(moduleCode: string): boolean {
    const modules = user?.role?.modules ?? []
    if (modules.length === 0) return true
    return modules.some((m) => m.code === moduleCode)
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, canAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
