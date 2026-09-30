import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import http from '../api/http'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'
import {
  Badge,
  Btn,
  Card,
  Input,
  Modale,
  Onglets,
  PaginationBar,
  Screen,
  SectionTitle,
  EtatVide,
} from '../components/ui'

type PassageRef = {
  id: number
  numeroOrdre: string
  patient: { nom: string; prenom: string; code?: string; age?: string; sexe?: string }
  nbSoins?: number
}

export default function SoinsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1

  const [onglet, setOnglet] = useState<'file' | 'recherche' | 'historique'>('file')
  const [file, setFile] = useState<any[]>([])
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [passage, setPassage] = useState<PassageRef | null>(null)
  const [detail, setDetail] = useState<any>(null)

  // Historique
  const [histo, setHisto] = useState<any>({ data: [], total: 0, page: 1, perPage: 10, totalPages: 1 })
  const [histoJour, setHistoJour] = useState('')

  // Réalisation
  const [realiserVisible, setRealiserVisible] = useState(false)
  const [realiserCible, setRealiserCible] = useState<any>(null)
  const [realiserDate, setRealiserDate] = useState('')
  const [realiserObs, setRealiserObs] = useState('')
  const [saving, setSaving] = useState(false)

  async function chargerFile() {
    try {
      const { data } = await http.get('/soins/file', { params: { cliniqueId } })
      setFile(data ?? [])
    } catch {
      setFile([])
    }
  }

  useEffect(() => {
    if (onglet === 'file' && !passage) chargerFile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, passage])

  async function chargerHistorique(p = 1) {
    try {
      const { data } = await http.get('/soins/realisations', {
        params: { cliniqueId, jour: histoJour || undefined, page: p, perPage: 10 },
      })
      setHisto(data)
    } catch {
      setHisto({ data: [], total: 0, page: 1, perPage: 10, totalPages: 1 })
    }
  }

  useEffect(() => {
    if (onglet === 'historique' && !passage) {
      const t = setTimeout(() => chargerHistorique(1), 300)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, histoJour])

  // Recherche (debounce)
  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/soins/recherche', { params: { code: q, cliniqueId } })
        setResultats(data ?? [])
      } catch {
        setResultats([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [recherche])

  async function choisirPassage(p: PassageRef) {
    setPassage(p)
    setResultats([])
    setRecherche('')
    try {
      const { data } = await http.get(`/soins/passages/${p.id}`)
      setDetail(data)
    } catch {
      Alert.alert('Soins', 'Impossible de charger le passage.')
    }
  }

  function quitter() {
    setPassage(null)
    setDetail(null)
    chargerFile()
  }

  const lignesSoins = useMemo(() => {
    if (!detail) return []
    const par = new Map((detail.soins ?? []).map((s: any) => [s.passagePrestationId, s]))
    return (detail.prestations ?? []).map((l: any) => ({ ...l, soin: par.get(l.id) ?? null }))
  }, [detail])

  function statutLabel(soin: any) {
    if (!soin) return 'À réaliser'
    if (soin.statut === 'EN_ATTENTE') return 'En attente'
    return 'Réalisé'
  }

  function ouvrirRealisation(ligne: any) {
    setRealiserCible(ligne)
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    setRealiserDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`)
    setRealiserObs('')
    setRealiserVisible(true)
  }

  async function confirmerRealisation() {
    if (!passage || !realiserCible || !realiserDate) {
      Alert.alert('Soins', 'Indiquez la date et l’heure de réalisation.')
      return
    }
    setSaving(true)
    try {
      await http.post(`/soins/passages/${passage.id}/realiser`, {
        passagePrestationId: realiserCible.id,
        date: new Date(realiserDate).toISOString(),
        observations: realiserObs || undefined,
      })
      Alert.alert('✅ Soin réalisé', 'Date et agent tracés.')
      setRealiserVisible(false)
      const { data } = await http.get(`/soins/passages/${passage.id}`)
      setDetail(data)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Réalisation impossible.')
    } finally {
      setSaving(false)
    }
  }

  const toutesRealisations = useMemo(
    () =>
      (detail?.soins ?? []).flatMap((s: any) =>
        (s.realisations ?? []).map((r: any) => ({ ...r, soinLibelle: s.libelle })),
      ),
    [detail],
  )

  if (!passage) {
    return (
      <Screen padded={false}>
        <View style={styles.bandeau}>
          <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
            <Text style={styles.btnRetourTexte}>← Modules</Text>
          </TouchableOpacity>
          <Text style={styles.titre}>💉 Soins</Text>
          <TextInput
            style={styles.recherche}
            placeholder="Rechercher par code patient, nom ou N° d'ordre…"
            placeholderTextColor="#94a3b8"
            value={recherche}
            onChangeText={setRecherche}
          />
        </View>
        <View style={{ padding: 16 }}>
          <Onglets
            actif={onglet}
            onChange={(k) => setOnglet(k as typeof onglet)}
            tabs={[
              { key: 'file', label: 'File d\'attente', count: file.length },
              { key: 'recherche', label: 'Recherche' },
              { key: 'historique', label: 'Historique' },
            ]}
          />
          {onglet === 'file' ? (
            <>
              {file.length === 0 ? <EtatVide texte="Aucun patient en attente de soins." /> : null}
              {file.map((p: any, i: number) => (
                <View key={p.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>{i + 1}. {p.patient?.nom} {p.patient?.prenom}</Text>
                    <Text style={styles.itemSous}>{p.numeroOrdre} · {p.nbSoins} soin(s)</Text>
                  </View>
                  <Btn title="💉 Traitement" small onPress={() => choisirPassage(p)} />
                </View>
              ))}
            </>
          ) : onglet === 'recherche' ? (
            <>
              {resultats.map((p) => (
                <TouchableOpacity key={p.id} style={styles.item} onPress={() => choisirPassage(p)}>
                  <Text style={styles.itemTitre}>{p.patient.nom} {p.patient.prenom}</Text>
                  <Text style={styles.itemSous}>{p.numeroOrdre} · {p.nbSoins ?? 0} soin(s) payé(s)</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <Input label="Jour (AAAA-MM-JJ)" value={histoJour} onChangeText={setHistoJour} />
              {histo.data?.length === 0 ? <EtatVide texte="Aucune réalisation." /> : null}
              {(histo.data ?? []).map((r: any) => (
                <View key={r.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>{r.soin?.patient?.nom} {r.soin?.patient?.prenom}</Text>
                    <Text style={styles.itemSous}>
                      {r.soin?.libelle} · {r.soin?.passage?.numeroOrdre ?? ''} ·{' '}
                      {r.date ? new Date(r.date).toLocaleString('fr-FR') : ''}
                    </Text>
                  </View>
                </View>
              ))}
              <PaginationBar page={histo.page ?? 1} totalPages={histo.totalPages ?? 1} onPage={(p) => chargerHistorique(p)} />
            </>
          )}
        </View>
      </Screen>
    )
  }

  return (
    <Screen padded={false}>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={quitter}>
          <Text style={styles.btnRetourTexte}>← Liste</Text>
        </TouchableOpacity>
        <Text style={styles.titre}>💉 {passage.patient?.nom} {passage.patient?.prenom}</Text>
        <Text style={styles.sousTitre}>{passage.numeroOrdre} · {passage.patient?.age ?? '—'} ans</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card>
          <SectionTitle>Soins payés</SectionTitle>
          {lignesSoins.length === 0 ? <EtatVide texte="Aucun soin payé pour ce passage." /> : null}
          {lignesSoins.map((l: any) => (
            <View key={l.id} style={styles.ligneMed}>
              <View style={{ flex: 1 }}>
                <Text style={styles.medNom}>{l.libelle}</Text>
                <Badge label={statutLabel(l.soin)} tone={l.soin && l.soin.statut !== 'EN_ATTENTE' ? 'success' : 'muted'} />
                {l.soin ? <Text style={styles.itemSous}>{l.soin.realisations?.length ?? 0} réalisation(s)</Text> : null}
              </View>
              <Btn title="💉 Réaliser" small onPress={() => ouvrirRealisation(l)} />
            </View>
          ))}
        </Card>

        {toutesRealisations.length > 0 ? (
          <Card>
            <SectionTitle>Réalisations de ce passage</SectionTitle>
            {toutesRealisations.map((r: any) => (
              <View key={r.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitre}>{r.soinLibelle}</Text>
                  <Text style={styles.itemSous}>
                    {r.date ? new Date(r.date).toLocaleString('fr-FR') : ''} ·{' '}
                    {r.agent?.personnel?.prenom ?? ''} {r.agent?.personnel?.nom ?? ''}
                  </Text>
                  {r.observations ? <Text style={styles.itemSous}>Obs : {r.observations}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <Modale
        visible={realiserVisible}
        titre={`💉 Réaliser — ${realiserCible?.libelle ?? ''}`}
        onFermer={() => setRealiserVisible(false)}
        actions={
          <>
            <Btn title="Annuler" small variant="outline" onPress={() => setRealiserVisible(false)} />
            <Btn title="💉 Confirmer" small onPress={confirmerRealisation} loading={saving} />
          </>
        }
      >
        <Input label="Date et heure (AAAA-MM-JJTHH:MM)" value={realiserDate} onChangeText={setRealiserDate} />
        <Input label="Observations" value={realiserObs} onChangeText={setRealiserObs} multiline />
      </Modale>
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
  titre: { fontSize: 21, fontWeight: '800', color: colors.primaryDarker, marginBottom: 4 },
  sousTitre: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  recherche: {
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  itemTitre: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  itemSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  ligneMed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
    flexWrap: 'wrap',
  },
  medNom: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 14 },
})
