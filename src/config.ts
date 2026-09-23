import Constants from 'expo-constants'

/**
 * Adresse de l'API.
 * En développement, le bundle Expo est servi par le PC (hostUri = ip:8081) :
 * on en déduit l'IP du poste qui héberge aussi le backend (port 3000).
 * L'utilisateur peut la corriger depuis l'écran de connexion (champ « Serveur »).
 */
export function getApiUrl(): string {
  const hostUri: string | undefined = Constants.expoConfig?.hostUri
  if (hostUri) {
    const ip = hostUri.split(':')[0]
     if (ip) return `http://${ip}:3000/api`
    //return 'https://clinique.easymanagement.tech/api'

  }
   return 'http://localhost:3000/api'
  //return 'https://clinique.easymanagement.tech/api'
}
