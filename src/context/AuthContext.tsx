import React, { createContext, useContext, useEffect, useState } from 'react'
import { AppState } from 'react-native'
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
  /** Service en cours (pointage) : null = pas en service. */
  service: { id: number; debut: string } | null
  /** L'agent doit prendre son service avant d'ouvrir un module (l'administrateur en est dispensé). */
  doitPrendreService: boolean
  chargerService: () => Promise<void>
  prendreService: () => Promise<void>
  terminerService: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  canAccess: () => true,
  service: null,
  doitPrendreService: false,
  chargerService: async () => {},
  prendreService: async () => {},
  terminerService: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [service, setService] = useState<{ id: number; debut: string } | null>(null)
  // false si le serveur ne gère pas encore le pointage : rien n'est alors verrouillé
  const [pointageDisponible, setPointageDisponible] = useState(true)

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

  // ── Pointage de service (mêmes règles que le web) ──
  async function chargerService() {
    try {
      const { data } = await http.get('/finances/mon-service')
      setService(data.service)
      setPointageDisponible(true)
    } catch (e: any) {
      if (e.response?.status !== 401) setPointageDisponible(false)
      setService(null)
    }
  }
  async function prendreService() {
    const { data } = await http.post('/finances/mon-service/prendre')
    setService(data.service)
  }
  async function terminerService() {
    await http.post('/finances/mon-service/terminer')
    setService(null)
  }

  // Service en cours chargé à la connexion
  useEffect(() => {
    if (token) chargerService()
    else setService(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Signal de présence chaque minute tant que l'application est ouverte au premier plan
  useEffect(() => {
    if (!token) return
    const signaler = () => {
      if (AppState.currentState === 'active') http.post('/finances/mon-service/presence').catch(() => {})
    }
    signaler()
    const minuterie = setInterval(signaler, 60000)
    return () => clearInterval(minuterie)
  }, [token])

  const exempteDePointage = user?.role?.code === 'ADMINISTRATEUR'
  const doitPrendreService = pointageDisponible && !exempteDePointage && !service

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
    <AuthContext.Provider
      value={{ token, user, loading, login, logout, canAccess, service, doitPrendreService, chargerService, prendreService, terminerService }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
