import React from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'
import { Btn, Input, Modale } from '../components/ui'
import http from '../api/http'
import { useState } from 'react'

type Nav = { navigate: (r: string) => void }

/** Modules du menu (mêmes codes que le web). Les écrans à venir sont grisés. */
const MODULES: { code: string; label: string; icon: string; route: string | null }[] = [
  { code: 'ACCUEIL', label: 'Accueil', icon: '🏥', route: 'Accueil' },
  { code: 'CAISSE', label: 'Caisse', icon: '💰', route: 'Caisse' },
  { code: 'CONSULTATION', label: 'Consultation', icon: '🩺', route: 'Consultation' },
  { code: 'PHARMACIE', label: 'Pharmacie', icon: '💊', route: 'Pharmacie' },
  { code: 'LABORATOIRE', label: 'Laboratoire', icon: '🧪', route: 'Laboratoire' },
  { code: 'IMAGERIE', label: 'Imagerie', icon: '🩻', route: 'Imagerie' },
  { code: 'HOSPITALISATION', label: 'Hospitalisation', icon: '🛏️', route: 'Hospitalisation' },
  { code: 'STATISTIQUES', label: 'Statistiques', icon: '📊', route: 'Statistiques' },
  { code: 'PARAMETRAGE', label: 'Paramétrage', icon: '⚙️', route: null },
]

export default function HomeScreen({ navigation }: { navigation: Nav }) {
  const { user, logout, canAccess } = useAuth()
  const insets = useSafeAreaInsets()
  const personnel = user?.personnel

  const initiales = personnel
    ? `${personnel.prenom?.[0] ?? ''}${personnel.nom?.[0] ?? ''}`.toUpperCase()
    : '🏥'

  const dateDuJour = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  function ouvrir(mod: { code: string; route: string | null; label: string }) {
    if (!canAccess(mod.code)) {
      Alert.alert('Accès refusé', 'Votre rôle ne permet pas d\'ouvrir ce module.')
      return
    }
    if (!mod.route) {
      Alert.alert(
        mod.code === 'PARAMETRAGE' ? 'Module web uniquement' : 'Bientôt disponible',
        mod.code === 'PARAMETRAGE'
          ? 'Le paramétrage (utilisateurs, prestations, assurances, imprimantes…) se fait depuis la version web : https://clinique.easymanagement.tech'
          : `Le module ${mod.label} arrive dans une prochaine version.`,
      )
      return
    }
    navigation.navigate(mod.route)
  }

  function deconnexion() {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Oui', style: 'destructive', onPress: () => logout() },
    ])
  }

  // ── Changement de mot de passe ──
  const [mdpVisible, setMdpVisible] = useState(false)
  const [mdp, setMdp] = useState({ actuel: '', nouveau: '', confirmation: '' })
  const [mdpEnCours, setMdpEnCours] = useState(false)

  async function changerMotDePasse() {
    if (mdp.nouveau.length < 6) {
      Alert.alert('Mot de passe', 'Le nouveau mot de passe doit contenir au moins 6 caractères.')
      return
    }
    if (mdp.nouveau !== mdp.confirmation) {
      Alert.alert('Mot de passe', 'La confirmation ne correspond pas au nouveau mot de passe.')
      return
    }
    setMdpEnCours(true)
    try {
      await http.post('/auth/changer-mot-de-passe', {
        motDePasseActuel: mdp.actuel,
        nouveauMotDePasse: mdp.nouveau,
      })
      Alert.alert('✅ Mot de passe modifié', 'Utilisez votre nouveau mot de passe à la prochaine connexion.')
      setMdpVisible(false)
      setMdp({ actuel: '', nouveau: '', confirmation: '' })
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Changement impossible.')
    } finally {
      setMdpEnCours(false)
    }
  }

  return (
    <View style={styles.ecran}>
      {/* En-tête dégradé */}
      <LinearGradient
        colors={['#0d9488', '#0f766e', '#115e59']}
        style={[styles.header, { paddingTop: insets.top + 26 }]}
      >
        <View style={styles.headerLigne}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexte}>{initiales}</Text>
          </View>
          <View style={styles.headerInfos}>
            <Text style={styles.salutation}>
              Bonjour, {personnel?.prenom ?? ''} {personnel?.nom ?? user?.matricule}
            </Text>
            <Text style={styles.headerRole}>
              {user?.role?.nom ?? ''} · {user?.clinique?.nom ?? ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.btnDeconnexion} onPress={() => setMdpVisible(true)}>
            <Text style={styles.btnDeconnexionTexte}>🔑 Mot de passe</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnDeconnexion} onPress={deconnexion}>
            <Text style={styles.btnDeconnexionTexte}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.dateJour}>{dateDuJour}</Text>
      </LinearGradient>

      {/* Modules */}
      <ScrollView contentContainerStyle={styles.contenu}>
        <Text style={styles.sectionTitre}>Mes modules</Text>
        <View style={styles.grille}>
          {MODULES.map((m) => {
            const autorise = canAccess(m.code)
            return (
              <TouchableOpacity
                key={m.code}
                style={[styles.carte, !autorise && styles.carteInactive]}
                onPress={() => ouvrir(m)}
                activeOpacity={0.7}
              >
                <View style={styles.carteIcone}>
                  <Text style={styles.carteIconeTexte}>{m.icon}</Text>
                </View>
                <Text style={styles.carteLabel}>{m.label}</Text>
                {!autorise ? <Text style={styles.carteCadenas}>🔒</Text> : null}
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* Modale : changer son mot de passe */}
      <Modale
        visible={mdpVisible}
        titre="🔑 Changer le mot de passe"
        onFermer={() => setMdpVisible(false)}
        actions={
          <>
            <Btn title="Annuler" small variant="outline" onPress={() => setMdpVisible(false)} />
            <Btn title="Changer" small onPress={changerMotDePasse} loading={mdpEnCours} />
          </>
        }
      >
        <Input
          label="Mot de passe actuel *"
          value={mdp.actuel}
          onChangeText={(t) => setMdp({ ...mdp, actuel: t })}
          secureTextEntry
          autoCapitalize="none"
        />
        <Input
          label="Nouveau mot de passe * (6 caractères minimum)"
          value={mdp.nouveau}
          onChangeText={(t) => setMdp({ ...mdp, nouveau: t })}
          secureTextEntry
          autoCapitalize="none"
        />
        <Input
          label="Confirmer le nouveau mot de passe *"
          value={mdp.confirmation}
          onChangeText={(t) => setMdp({ ...mdp, confirmation: t })}
          secureTextEntry
          autoCapitalize="none"
        />
      </Modale>
    </View>
  )
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    shadowColor: '#0f766e',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  headerLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
  },
  avatarTexte: { fontSize: 18, fontWeight: '800', color: '#0f766e' },
  headerInfos: { flex: 1 },
  salutation: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  headerRole: { color: 'rgba(236,253,245,0.85)', fontSize: 12.5, marginTop: 3 },
  btnDeconnexion: {
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  btnDeconnexionTexte: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dateJour: {
    color: 'rgba(236,253,245,0.85)',
    fontSize: 12.5,
    marginTop: 16,
    textTransform: 'capitalize',
  },
  contenu: { padding: 20, paddingBottom: 40 },
  sectionTitre: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 12,
  },
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  carte: {
    width: '31%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 6,
    alignItems: 'center',
    shadowColor: '#0f766e',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  carteInactive: { opacity: 0.45 },
  carteIcone: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    borderColor: '#a7f3d0',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  carteIconeTexte: { fontSize: 26 },
  carteLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.primaryDarker,
    textAlign: 'center',
  },
  carteCadenas: { fontSize: 11, marginTop: 3 },
})
