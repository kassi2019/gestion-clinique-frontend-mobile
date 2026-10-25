import React, { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import http from '../api/http'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'
import { Card, EtatVide, Screen, SectionTitle } from '../components/ui'

type Video = {
  code: string
  module?: string
  titre: string
  icone: string
  description: string
  fichier: string
  duree: number
}

/**
 * Adresse du site qui publie les vidéos (même liste que le menu Tutoriels du web) :
 * l'API se termine par /api ; en développement le backend est sur :3000 et le web sur :5173.
 */
function adresseSite() {
  const api = String(http.defaults.baseURL ?? '')
  return api.replace(/\/api\/?$/, '').replace(/:3000$/, ':5173')
}

const formatDuree = (s: number) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`

/** Lecteur : recréé à chaque vidéo choisie (libéré automatiquement en quittant). */
function Lecteur({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => p.play())
  return <VideoView player={player} style={styles.video} nativeControls fullscreenOptions={{ enable: true }} />
}

export default function TutorielsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { canAccess } = useAuth()
  const site = adresseSite()
  const [videos, setVideos] = useState<Video[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [choisie, setChoisie] = useState<Video | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch(`${site}/videos/index.json`, { cache: 'no-cache' })
        const liste: Video[] = await r.json()
        // L'utilisateur ne voit que les vidéos des modules attribués à son rôle
        setVideos(liste.filter((v) => canAccess(v.module ?? v.code)))
      } catch {
        setErreur('Impossible de charger les vidéos. Vérifiez la connexion internet.')
      } finally {
        setChargement(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Screen padded={false}>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <Text style={styles.titre}>🎬 Tutoriels vidéo</Text>
        <Text style={styles.sousTitre}>Apprendre à utiliser vos modules</Text>
      </View>

      {choisie ? (
        <View style={styles.lecteur}>
          <Lecteur key={choisie.fichier} uri={`${site}/videos/${choisie.fichier}`} />
          <Text style={styles.lecteurTitre}>
            {choisie.icone} {choisie.titre}
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card>
          <SectionTitle>Vos vidéos</SectionTitle>
          {chargement ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} /> : null}
          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
          {!chargement && !erreur && videos.length === 0 ? (
            <EtatVide texte="Aucune vidéo disponible pour vos modules pour le moment." />
          ) : null}
          {videos.map((v) => (
            <TouchableOpacity
              key={v.code}
              style={[styles.item, choisie?.code === v.code && styles.itemActif]}
              onPress={() => setChoisie(v)}
              activeOpacity={0.7}
            >
              <Text style={styles.icone}>{v.icone}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitre}>{v.titre}</Text>
                <Text style={styles.itemSous}>{v.description}</Text>
              </View>
              <Text style={styles.duree}>{choisie?.code === v.code ? '▶ En cours' : formatDuree(v.duree)}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  bandeau: { paddingHorizontal: 16, marginBottom: 8 },
  btnRetour: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  btnRetourTexte: { color: colors.primaryDark, fontWeight: '800', fontSize: 13.5 },
  titre: { fontSize: 21, fontWeight: '800', color: colors.primaryDarker, marginBottom: 2 },
  sousTitre: { fontSize: 13, color: colors.textMuted },
  lecteur: { backgroundColor: '#000' },
  video: { width: '100%', aspectRatio: 16 / 9 },
  lecteurTitre: { color: '#fff', fontWeight: '700', fontSize: 14, padding: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  itemActif: { backgroundColor: colors.primaryLight },
  icone: { fontSize: 26 },
  itemTitre: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  duree: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  erreur: { color: colors.danger, marginVertical: 10 },
})
