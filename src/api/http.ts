import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApiUrl } from '../config'

const http = axios.create({ baseURL: getApiUrl(), timeout: 20000 })

// Callback de déconnexion visuelle (enregistré par AuthContext) :
// quand le jeton expire (401), l'utilisateur doit retourner à l'écran
// de connexion, pas rester sur un écran en erreur.
let onUnauthorized: (() => void) | null = null
export function setOnUnauthorized(fn: (() => void) | null) {
  onUnauthorized = fn
}

// Token Bearer sur chaque requête
http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      AsyncStorage.multiRemove(['token', 'user'])
      // Sauf sur la connexion elle-même : un mauvais matricule/mot de
      // passe doit afficher « Matricule ou mot de passe incorrect »,
      // pas déconnecter (on est déjà sur l'écran de login).
      const url: string = err.config?.url ?? ''
      if (!url.includes('/auth/login') && onUnauthorized) onUnauthorized()
    }
    return Promise.reject(err)
  },
)

export default http
