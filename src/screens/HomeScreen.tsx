import React, { useEffect } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'
import { Btn, Input, Modale } from '../components/ui'
import http from '../api/http'
import { useState } from 'react'

type Nav = { navigate: (r: string) => void }

/** Modules du menu (mêmes codes que le web). */
const MODULES: { code: string; label: string; icon: string; route: string | null }[] = [
  { code: 'ACCUEIL', label: 'Accueil', icon: '🏥', route: 'Accueil' },
  { code: 'CAISSE', label: 'Caisse', icon: '💰', route: 'Caisse' },
  { code: 'CONSULTATION', label: 'Consultation', icon: '🩺', route: 'Consultation' },
  { code: 'PHARMACIE', label: 'Pharmacie', icon: '💊', route: 'Pharmacie' },
  { code: 'LABORATOIRE', label: 'Laboratoire', icon: '🧪', route: 'Laboratoire' },
  { code: 'IMAGERIE', label: 'Imagerie', icon: '🩻', route: 'Imagerie' },
  { code: 'MATERNITE', label: 'Maternité', icon: '🤰', route: 'Maternite' },
  { code: 'HOSPITALISATION', label: 'Hospitalisation', icon: '🛏️', route: 'Hospitalisation' },
  { code: 'SOINS', label: 'Soins', icon: '💉', route: 'Soins' },
  { code: 'STATISTIQUES', label: 'Statistiques', icon: '📊', route: 'Statistiques' },
  { code: 'FINANCES', label: 'Finances', icon: '💼', route: 'Finances' },
  { code: 'PARAMETRAGE', label: 'Paramétrage', icon: '⚙️', route: null },
]

/** Regroupement par thème (même ordre que le web). */
const GROUPES = [
  { titre: '🩺 Parcours du patient', codes: ['ACCUEIL', 'CAISSE', 'CONSULTATION', 'SOINS', 'HOSPITALISATION', 'MATERNITE'] },
  { titre: '🔬 Examens et pharmacie', codes: ['LABORATOIRE', 'IMAGERIE', 'PHARMACIE'] },
  { titre: '📊 Gestion et pilotage', codes: ['FINANCES', 'STATISTIQUES', 'PARAMETRAGE'] },
]

export default function HomeScreen({ navigation }: { navigation: Nav }) {
  const { user, logout, canAccess, service, doitPrendreService, chargerService, prendreService, terminerService } = useAuth()

  // Tous les modules sont affichés, rangés par thème ; ceux qui ne sont pas attribués au rôle restent grisés
  const groupes = GROUPES.map((g) => ({
    titre: g.titre,
    modules: g.codes
      .map((c) => MODULES.find((m) => m.code === c))
      .filter((m): m is (typeof MODULES)[number] => !!m)
      .map((m) => ({ ...m, autorise: canAccess(m.code) })),
  }))
  const aucunModuleAttribue = !MODULES.some((m) => canAccess(m.code))

  // ── Pointage ──
  const [pointageEnCours, setPointageEnCours] = useState(false)
  const [maintenant, setMaintenant] = useState(Date.now())
  useEffect(() => {
    chargerService()
    const horloge = setInterval(() => setMaintenant(Date.now()), 30000)
    return () => clearInterval(horloge)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dureeService = service
    ? (() => {
        const min = Math.max(0, Math.round((maintenant - new Date(service.debut).getTime()) / 60000))
        return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
      })()
    : ''
  async function prendre() {
    setPointageEnCours(true)
    try {
      await prendreService()
      Alert.alert('✅ Service commencé', 'Bon service !')
    } catch (e: any) {
      Alert.alert('Pointage', e.response?.data?.message ?? 'Pointage impossible.')
      await chargerService()
    } finally {
      setPointageEnCours(false)
    }
  }
  function terminer() {
    Alert.alert(
      'Terminer votre service ?',
      `Durée du service : ${dureeService}. Les modules seront verrouillés jusqu'à votre prochaine prise de service.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Oui, terminer',
          style: 'destructive',
          onPress: async () => {
            setPointageEnCours(true)
            try {
              await terminerService()
              Alert.alert('Service terminé', 'Merci !')
            } catch (e: any) {
              Alert.alert('Pointage', e.response?.data?.message ?? 'Pointage impossible.')
              await chargerService()
            } finally {
              setPointageEnCours(false)
            }
          },
        },
      ],
    )
  }
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
    if (doitPrendreService) {
      Alert.alert('Prenez votre service', 'Touchez « Prendre mon service » pour ouvrir les modules.')
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
            <Text style={styles.salutation} numberOfLines={1} ellipsizeMode="tail">
              Bonjour, {personnel?.prenom ?? ''} {personnel?.nom ?? user?.matricule}
            </Text>
            <Text style={styles.headerRole} numberOfLines={1} ellipsizeMode="tail">
              {user?.role?.nom ?? ''} · {user?.clinique?.nom ?? ''}
            </Text>
          </View>
          {/* Boutons empilés verticalement : ne compriment pas le nom à l'écran */}
          <View style={styles.headerBoutons}>
            <TouchableOpacity style={styles.btnDeconnexion} onPress={() => setMdpVisible(true)}>
              <Text style={styles.btnDeconnexionTexte}>🔑 MDP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnDeconnexion} onPress={deconnexion}>
              <Text style={styles.btnDeconnexionTexte}>⏻ Quitter</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.dateJour}>{dateDuJour}</Text>
      </LinearGradient>

      {/* Modules */}
      <ScrollView contentContainerStyle={styles.contenu}>
        {/* Pointage : prise et fin de service */}
        <View style={[styles.pointage, service && styles.pointageActif]}>
          <View style={{ flex: 1 }}>
            {service ? (
              <>
                <Text style={styles.pointageTitre}>🟢 Vous êtes en service</Text>
                <Text style={styles.pointageTexte}>
                  depuis le {new Date(service.debut).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — {dureeService}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.pointageTitre}>⚪ Vous n'êtes pas en service</Text>
                <Text style={styles.pointageTexte}>Pointez à votre arrivée pour ouvrir vos modules.</Text>
              </>
            )}
          </View>
          <TouchableOpacity
            style={[styles.btnPointage, service && styles.btnPointageFin, pointageEnCours && { opacity: 0.6 }]}
            onPress={service ? terminer : prendre}
            disabled={pointageEnCours}
          >
            <Text style={styles.btnPointageTexte}>{service ? '⏹ Terminer' : '▶ Prendre mon service'}</Text>
          </TouchableOpacity>
        </View>

        {aucunModuleAttribue ? (
          <Text style={styles.aucunModule}>Aucun module n'est attribué à votre rôle. Contactez l'administrateur.</Text>
        ) : null}
        {groupes.map((g) => (
          <View key={g.titre} style={styles.groupe}>
            <Text style={styles.sectionTitre}>{g.titre}</Text>
            <View style={styles.grille}>
              {g.modules.map((m) => (
                <TouchableOpacity
                  key={m.code}
                  style={[styles.carte, (!m.autorise || doitPrendreService) && styles.carteInactive]}
                  onPress={() => ouvrir(m)}
                  activeOpacity={0.7}
                >
                  <View style={styles.carteIcone}>
                    <Text style={styles.carteIconeTexte}>{m.icon}</Text>
                  </View>
                  <View style={styles.carteTexte}>
                    <Text style={styles.carteLabel} numberOfLines={2}>{m.label}</Text>
                    {!m.autorise ? <Text style={styles.carteNonAttribue}>Non attribué</Text> : null}
                  </View>
                  {!m.autorise ? (
                    <Text style={styles.carteCadenas}>🔒</Text>
                  ) : doitPrendreService ? (
                    <Text style={styles.carteCadenas}>⏱</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Modale : changer son mot de passe (centrée) */}
      <Modale
        visible={mdpVisible}
        titre="🔑 Changer le mot de passe"
        centree
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
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
    flexShrink: 0,
  },
  avatarTexte: { fontSize: 17, fontWeight: '800', color: '#0f766e' },
  headerInfos: { flex: 1, minWidth: 0 },
  salutation: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  headerRole: { color: 'rgba(236,253,245,0.85)', fontSize: 12, marginTop: 3 },
  headerBoutons: {
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  btnDeconnexion: {
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  btnDeconnexionTexte: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
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
    justifyContent: 'flex-start',
    rowGap: 14,
  },
  groupe: { marginBottom: 20 },
  aucunModule: { textAlign: 'center', color: colors.textMuted, marginTop: 30 },
  pointage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderColor: '#cbd5e1',
    borderWidth: 1.5,
    borderRadius: 16,
  },
  pointageActif: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  pointageTitre: { fontSize: 14, fontWeight: '800', color: colors.text },
  pointageTexte: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  btnPointage: { backgroundColor: '#16a34a', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  btnPointageFin: { backgroundColor: '#dc2626' },
  btnPointageTexte: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  carte: {
    width: '31%',
    marginRight: '2.3%', // trois cartes par ligne, alignées à gauche

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
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDarker,
    textAlign: 'center',
  },
  carteCadenas: { fontSize: 11, marginTop: 3 },
  carteTexte: { alignItems: 'center' },
  carteNonAttribue: { fontSize: 9, color: '#64748b', marginTop: 2, textAlign: 'center' },
})
