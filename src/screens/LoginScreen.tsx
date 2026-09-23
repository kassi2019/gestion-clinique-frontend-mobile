import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import http from '../api/http'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'

const REMPLISSAGE = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }

export default function LoginScreen() {
  const { login } = useAuth()
  const [matricule, setMatricule] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState('')

  // Configuration publique : nom de la clinique + image paramétrée (Paramétrage)
  const [cliniqueNom, setCliniqueNom] = useState('')
  const [loginImage, setLoginImage] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await http.get('/auth/config-public')
        setCliniqueNom(data.clinique?.nom ?? '')
        setLoginImage(data.loginImage ?? null)
      } catch {
        /* visuel par défaut */
      }
    })()
  }, [])

  async function seConnecter() {
    if (!matricule.trim() || !motDePasse) {
      setErreur('Saisissez votre matricule et votre mot de passe.')
      return
    }
    setChargement(true)
    setErreur('')
    try {
      await login(matricule.trim(), motDePasse)
    } catch (e: any) {
      if (e.response?.status === 401) {
        setErreur('Matricule ou mot de passe incorrect.')
      } else if (e.code === 'ECONNABORTED' || e.message?.includes('Network')) {
        setErreur('Serveur injoignable : vérifiez que le téléphone est sur le même réseau que le poste.')
      } else {
        setErreur('Connexion impossible.')
      }
    } finally {
      setChargement(false)
    }
  }

  function motDePasseOublie() {
    Alert.alert(
      'Mot de passe oublié',
      "Contactez un administrateur : il réinitialise votre mot de passe depuis Paramétrage → Utilisateurs → « Réinitialiser le mot de passe » (version web).",
    )
  }

  return (
    <View style={styles.ecran}>
      {/* Fond : couleurs du logo (vert sombre #112712) */}
      <LinearGradient
        colors={['#1a3620', '#112712', '#0c1d0d']}
        style={REMPLISSAGE}
      />

      <KeyboardAvoidingView
        style={styles.contenu}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Carte de connexion */}
        <View style={styles.carte}>
          {/* Image de la clinique dans un cadre arrondi (paramétrable) */}
          {loginImage ? (
            <View style={styles.cadreImage}>
              <Image
                source={{ uri: loginImage }}
                style={styles.cadreImageContenu}
                resizeMode="cover"
              />
            </View>
          ) : (
            <LinearGradient
              colors={['#AAE652', '#86c93d']}
              style={styles.cadreFallback}
            >
              <Text style={styles.cadreFallbackIcone}>🏥</Text>
            </LinearGradient>
          )}

          <Text style={styles.titre}>Bienvenue</Text>
          <Text style={styles.nomClinique}>{cliniqueNom || 'Gestion Clinique'}</Text>
          <Text style={styles.sousTitre}>Connectez-vous avec votre matricule</Text>

          <Text style={styles.label}>Matricule</Text>
          <TextInput
            style={styles.champ}
            placeholder="Ex : ADM001"
            placeholderTextColor="#94a3b8"
            value={matricule}
            onChangeText={setMatricule}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            style={styles.champ}
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
          />

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          <LinearGradient
            colors={['#AAE652', '#8cc63f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bouton}
          >
            <Pressable
              style={styles.boutonPress}
              onPress={seConnecter}
              disabled={chargement}
            >
              {chargement ? (
                <ActivityIndicator color="#112712" />
              ) : (
                <Text style={styles.boutonTexte}>Se connecter</Text>
              )}
            </Pressable>
          </LinearGradient>

          <Pressable onPress={motDePasseOublie}>
            <Text style={styles.lienOublie}>Mot de passe oublié ?</Text>
          </Pressable>
        </View>

        <Text style={styles.pied}>
          {new Date().getFullYear()} · Application de gestion de clinique
        </Text>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#112712' },
  contenu: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoCercle: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -42,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  logoIcone: { fontSize: 40 },
  carte: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cadreImage: {
    alignSelf: 'center',
    width: 150,
    height: 150,
    borderRadius: 32,
    borderColor: '#ffffff',
    borderWidth: 3,
    backgroundColor: '#ffffff',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    overflow: 'hidden',
  },
  cadreImageContenu: {
    width: '100%',
    height: '100%',
  },
  cadreFallback: {
    alignSelf: 'center',
    width: 150,
    height: 150,
    borderRadius: 32,
    borderColor: '#ffffff',
    borderWidth: 3,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cadreFallbackIcone: { fontSize: 46 },
  titre: {
    fontSize: 24,
    fontWeight: '800',
    color: '#112712',
    textAlign: 'center',
  },
  nomClinique: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4d7c0f',
    textAlign: 'center',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sousTitre: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 5,
  },
  champ: {
    backgroundColor: '#f8fafc',
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
  },
  erreur: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    marginBottom: 14,
  },
  bouton: {
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#112712',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  boutonPress: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonTexte: { color: '#112712', fontSize: 16, fontWeight: '800' },
  lienOublie: {
    textAlign: 'center',
    color: '#b5dc5f',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 14,
    textDecorationLine: 'underline',
  },
  pied: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 24,
  },
})
