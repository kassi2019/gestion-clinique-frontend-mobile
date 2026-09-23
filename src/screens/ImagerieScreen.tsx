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
import { ApercuTexte, Badge, Btn, Card, Input, Onglets, PaginationBar, Screen, SectionTitle } from '../components/ui'

type PassageRef = {
  id: number
  numeroOrdre: string
  patient: { nom: string; prenom: string; code?: string; age?: string; sexe?: string }
  nbExamensIma?: number
}

export default function ImagerieScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1
  const peutValider =
    (user?.role?.modules ?? []).length === 0 ||
    (user?.role?.modules ?? []).find((m) => m.code === 'IMAGERIE')?.validation !== false

  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [passage, setPassage] = useState<PassageRef | null>(null)
  const [detail, setDetail] = useState<any>(null)

  const [crCible, setCrCible] = useState<any>(null)
  const [crForm, setCrForm] = useState({ indication: '', technique: '', resultat: '', conclusion: '' })
  const [enCours, setEnCours] = useState(false)

  // ── File d'attente (par ordre d'arrivée) + Historique ──
  const [onglet, setOnglet] = useState<'file' | 'en_cours' | 'historique'>('file')
  const [fileListe, setFileListe] = useState<any[]>([])
  const [fileChargement, setFileChargement] = useState(false)
  const [histoJour, setHistoJour] = useState('')
  const [histoRecherche, setHistoRecherche] = useState('')
  const [histoListe, setHistoListe] = useState<any[]>([])
  const [histoPage, setHistoPage] = useState(1)
  const [histoTotalPages, setHistoTotalPages] = useState(1)
  const [histoChargement, setHistoChargement] = useState(false)
  const [apercu, setApercu] = useState<string | null>(null)

  async function chargerFile() {
    setFileChargement(true)
    try {
      const { data } = await http.get('/imagerie/file', { params: { cliniqueId } })
      setFileListe(data ?? [])
    } catch {
      setFileListe([])
    } finally {
      setFileChargement(false)
    }
  }

  useEffect(() => {
    if (onglet === 'file' && !passage) chargerFile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, passage])

  async function chargerHistorique(p = 1) {
    setHistoChargement(true)
    try {
      const { data } = await http.get('/imagerie/examens', {
        params: {
          cliniqueId,
          jour: histoJour || undefined,
          recherche: histoRecherche.trim() || undefined,
          page: p,
          perPage: 20,
        },
      })
      setHistoListe(data.data ?? [])
      setHistoPage(p)
      setHistoTotalPages(data.totalPages ?? 1)
    } catch {
      setHistoListe([])
    } finally {
      setHistoChargement(false)
    }
  }

  useEffect(() => {
    if (onglet === 'historique' && !passage) {
      const t = setTimeout(() => chargerHistorique(1), 300)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, histoJour, histoRecherche])

  function voirCompteRendu(e: any) {
    setApercu(
      [
        `COMPTE RENDU IMAGERIE`,
        '',
        `${e.passage?.patient?.nom ?? ''} ${e.passage?.patient?.prenom ?? ''}`,
        `${e.passage?.numeroOrdre ?? ''}`,
        e.prestation?.libelle ?? '',
        '------------------------------------------',
        `Indication : ${e.indication ?? '—'}`,
        `Technique : ${e.technique ?? '—'}`,
        `Résultat : ${e.resultat ?? '—'}`,
        '',
        `Conclusion : ${e.conclusion ?? '—'}`,
      ].join('\n'),
    )
  }

  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/imagerie/recherche', {
          params: { code: q, cliniqueId },
        })
        setResultats(data)
      } catch {
        setResultats([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [recherche])

  async function choisirPassage(p: PassageRef) {
    setPassage(p)
    setResultats([])
    await chargerDetail(p.id)
  }

  async function chargerDetail(passageId: number) {
    try {
      const { data } = await http.get(`/imagerie/passages/${passageId}`)
      setDetail(data)
    } catch {
      Alert.alert('Imagerie', 'Impossible de charger le passage.')
    }
  }

  const lignesIma = useMemo(() => {
    if (!detail) return []
    const examens = detail.passage.examens ?? []
    const par = new Map(examens.map((e: any) => [e.passagePrestationId, e]))
    return (detail.passage.prestations ?? [])
      .filter(
        (l: any) =>
          l.statut === 'PAYEE' &&
          (l.service?.code === 'IMA' || l.prestation?.type === 'IMAGERIE' || par.has(l.id)),
      )
      .map((l: any) => ({ ...l, examen: par.get(l.id) ?? null }))
  }, [detail])

  const statutLabel = (e: any) =>
    !e ? 'À traiter' : e.statut === 'RESULTATS' ? 'Résultats saisis' : 'Validé'

  function ouvrirCr(ligne: any) {
    setCrCible(ligne)
    setCrForm({
      indication: ligne.examen?.indication ?? '',
      technique: ligne.examen?.technique ?? '',
      resultat: ligne.examen?.resultat ?? '',
      conclusion: ligne.examen?.conclusion ?? '',
    })
  }

  async function enregistrerCr() {
    if (!passage || !crCible) return
    if (!crForm.indication.trim() && !crForm.technique.trim() && !crForm.resultat.trim() && !crForm.conclusion.trim()) {
      Alert.alert('Compte rendu', 'Renseignez au moins une section.')
      return
    }
    setEnCours(true)
    try {
      await http.post(`/imagerie/passages/${passage.id}/examens`, {
        passagePrestationId: crCible.id,
        indication: crForm.indication,
        technique: crForm.technique,
        resultat: crForm.resultat,
        conclusion: crForm.conclusion,
      })
      Alert.alert('✅ Compte rendu enregistré')
      setCrCible(null)
      await chargerDetail(passage.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setEnCours(false)
    }
  }

  async function valider(examen: any) {
    Alert.alert('Valider le compte rendu ?', `Le CR de « ${examen.libelle} » sera verrouillé.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui, valider',
        onPress: async () => {
          try {
            await http.post(`/imagerie/examens/${examen.id}/valider`)
            Alert.alert('✅ Compte rendu validé')
            await chargerDetail(passage!.id)
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Validation impossible.')
          }
        },
      },
    ])
  }

  return (
    <Screen padded={false}>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <Text style={styles.titre}>🩻 Imagerie</Text>
        {!passage ? (
          <TextInput
            style={styles.recherche}
            placeholder="Rechercher par code patient, nom ou N° d'ordre…"
            placeholderTextColor="#94a3b8"
            value={recherche}
            onChangeText={setRecherche}
          />
        ) : null}
      </View>

      {!passage ? (
        <View style={{ padding: 16 }}>
          <Onglets
            actif={onglet}
            onChange={(k) => setOnglet(k as typeof onglet)}
            tabs={[
              { key: 'file', label: 'File d\'attente', count: fileListe.length },
              { key: 'en_cours', label: 'Recherche' },
              { key: 'historique', label: 'Historique' },
            ]}
          />
          {onglet === 'file' ? (
            <>
              {fileChargement ? <Text style={styles.vide}>Chargement…</Text> : null}
              {!fileChargement && fileListe.length === 0 ? (
                <Text style={styles.vide}>Aucun patient en attente d'examen.</Text>
              ) : null}
              {fileListe.map((p: any, i: number) => (
                <View key={p.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>
                      {i + 1}. {p.patient?.nom} {p.patient?.prenom}
                    </Text>
                    <Text style={styles.itemSous}>
                      {p.numeroOrdre} · {p.nbExamens} examen(s) ·{' '}
                      {p.createdAt ? new Date(p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                  <Btn
                    title="🩻 Traitement"
                    small
                    onPress={() => choisirPassage(p as any)}
                  />
                </View>
              ))}
            </>
          ) : onglet === 'en_cours' ? (
            <>
              {resultats.map((r) => (
                <TouchableOpacity key={r.id} style={styles.item} onPress={() => choisirPassage(r)}>
                  <Text style={styles.itemTitre}>
                    {r.patient.nom} {r.patient.prenom}
                  </Text>
                  <Text style={styles.itemSous}>
                    {r.numeroOrdre} · {r.nbExamensIma ?? 0} examen(s) payé(s)
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input label="Jour (AAAA-MM-JJ)" value={histoJour} onChangeText={setHistoJour} />
                </View>
                <View style={styles.ligneItem}>
                  <Input label="Rechercher" value={histoRecherche} onChangeText={setHistoRecherche} />
                </View>
              </View>
              {histoChargement ? <Text style={styles.vide}>Chargement…</Text> : null}
              {!histoChargement && histoListe.length === 0 ? (
                <Text style={styles.vide}>Aucun examen.</Text>
              ) : null}
              {histoListe.map((e) => (
                <TouchableOpacity key={e.id} style={styles.item} onPress={() => voirCompteRendu(e)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>
                      {e.passage?.patient?.nom ?? ''} {e.passage?.patient?.prenom ?? ''}
                    </Text>
                    <Text style={styles.itemSous}>
                      {e.passage?.numeroOrdre ?? ''} · {e.prestation?.libelle ?? ''}
                    </Text>
                  </View>
                  <Badge label={e.statut ?? ''} tone={e.statut === 'VALIDEE' || e.statut === 'Validé' ? 'success' : 'muted'} />
                </TouchableOpacity>
              ))}
              <PaginationBar page={histoPage} totalPages={histoTotalPages} onPage={(p) => chargerHistorique(p)} />
              {apercu ? <ApercuTexte contenu={apercu} /> : null}
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Card>
            <View style={styles.ficheTitre}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ficheNom}>
                  {passage.patient.nom} {passage.patient.prenom} · {passage.numeroOrdre}
                </Text>
                <Text style={styles.ficheSous}>
                  {detail?.passage?.patient?.age ?? '—'} ans · {detail?.passage?.patient?.sexe ?? '—'} ·{' '}
                  {detail?.passage?.referent ?? ''}
                </Text>
              </View>
              <Btn title="✕" small variant="outline" onPress={() => { setPassage(null); setDetail(null) }} />
            </View>
          </Card>

          <Card>
            <SectionTitle>Examens payés</SectionTitle>
            {lignesIma.length === 0 ? (
              <Text style={styles.vide}>Aucun examen payé pour ce passage.</Text>
            ) : (
              lignesIma.map((l: any) => (
                <View key={l.id} style={styles.ligneMed}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medNom}>{l.libelle}</Text>
                    <Badge label={statutLabel(l.examen)} tone={!l.examen ? 'muted' : l.examen.statut === 'VALIDE' ? 'success' : 'warning'} />
                  </View>
                  {!l.examen || l.examen.statut !== 'VALIDE' ? (
                    <Btn title="📝 Compte rendu" small variant="outline" onPress={() => ouvrirCr(l)} />
                  ) : null}
                  {l.examen?.statut === 'RESULTATS' && peutValider ? (
                    <Btn title="✅ Valider" small onPress={() => valider(l.examen)} />
                  ) : null}
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}

      {/* Modale compte rendu */}
      {crCible ? (
        <View style={styles.modalVoile}>
          <View style={styles.modalCarte}>
            <Text style={styles.modalTitre}>📝 Compte rendu — {crCible.libelle}</Text>
            <ScrollView style={{ flexGrow: 0 }}>
              <Input label="Indication" value={crForm.indication} onChangeText={(t) => setCrForm({ ...crForm, indication: t })} multiline />
              <Input label="Technique" value={crForm.technique} onChangeText={(t) => setCrForm({ ...crForm, technique: t })} multiline />
              <Input label="Résultat" value={crForm.resultat} onChangeText={(t) => setCrForm({ ...crForm, resultat: t })} multiline />
              <Input label="Conclusion" value={crForm.conclusion} onChangeText={(t) => setCrForm({ ...crForm, conclusion: t })} multiline />
            </ScrollView>
            <View style={styles.modalActions}>
              <Btn title="Annuler" variant="outline" onPress={() => setCrCible(null)} />
              <Btn title="💾 Enregistrer" onPress={enregistrerCr} loading={enCours} />
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  bandeau: { paddingHorizontal: 16, marginBottom: 10 },
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
  titre: { fontSize: 22, fontWeight: '800', color: colors.primaryDarker, marginBottom: 8 },
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
  item: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 12 },
  itemTitre: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  ficheTitre: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ficheNom: { fontSize: 16, fontWeight: '800', color: colors.primaryDarker },
  ficheSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
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
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
  ligne: { flexDirection: 'row', gap: 10 },
  ligneItem: { flex: 1 },
  modalVoile: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCarte: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    maxHeight: '92%',
  },
  modalTitre: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14 },
})
