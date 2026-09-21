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
import { Badge, Btn, Card, Input, Screen, SectionTitle } from '../components/ui'

type PassageRef = {
  id: number
  numeroOrdre: string
  patient: { nom: string; prenom: string; code?: string; age?: string; sexe?: string }
  nbExamensLab?: number
}

type LigneRes = { parametre: string; valeur: string; unite: string; normes: string }

export default function LaboratoireScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1
  const peutValider =
    (user?.role?.modules ?? []).length === 0 ||
    (user?.role?.modules ?? []).find((m) => m.code === 'LABORATOIRE')?.validation !== false

  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [passage, setPassage] = useState<PassageRef | null>(null)
  const [detail, setDetail] = useState<any>(null)

  // Modale résultats
  const [resCible, setResCible] = useState<any>(null)
  const [lignes, setLignes] = useState<LigneRes[]>([])
  const [conclusion, setConclusion] = useState('')
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/laboratoire/recherche', {
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
      const { data } = await http.get(`/laboratoire/passages/${passageId}`)
      setDetail(data)
    } catch {
      Alert.alert('Laboratoire', 'Impossible de charger le passage.')
    }
  }

  const lignesLab = useMemo(() => {
    if (!detail) return []
    const examens = detail.passage.examens ?? []
    const par = new Map(examens.map((e: any) => [e.passagePrestationId, e]))
    return (detail.passage.prestations ?? [])
      .filter(
        (l: any) =>
          l.statut === 'PAYEE' &&
          (l.service?.code === 'LAB' || l.prestation?.type === 'EXAMEN_LABO' || par.has(l.id)),
      )
      .map((l: any) => ({ ...l, examen: par.get(l.id) ?? null }))
  }, [detail])

  const statutLabel = (e: any) =>
    !e ? 'À prélever' : e.statut === 'PRELEVE' ? 'Prélèvement fait' : e.statut === 'RESULTATS' ? 'Résultats saisis' : 'Validé'

  async function prelever(ligne: any) {
    if (!passage) return
    Alert.alert('Prélèvement', `Enregistrer le prélèvement de « ${ligne.libelle} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui, prélevé',
        onPress: async () => {
          try {
            await http.post(`/laboratoire/passages/${passage.id}/prelevements`, {
              passagePrestationId: ligne.id,
            })
            Alert.alert('✅ Prélèvement enregistré (date et agent tracés)')
            await chargerDetail(passage.id)
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Prélèvement impossible.')
          }
        },
      },
    ])
  }

  function ouvrirResultats(examen: any) {
    setResCible(examen)
    setLignes(
      examen.lignes?.length
        ? examen.lignes.map((l: any) => ({ parametre: l.parametre, valeur: l.valeur ?? '', unite: l.unite ?? '', normes: l.normes ?? '' }))
        : [{ parametre: '', valeur: '', unite: '', normes: '' }],
    )
    setConclusion(examen.conclusion ?? '')
  }

  async function enregistrerResultats() {
    const valides = lignes.filter((l) => l.parametre.trim())
    if (!resCible || valides.length === 0) {
      Alert.alert('Résultats', 'Ajoutez au moins un paramètre.')
      return
    }
    setEnCours(true)
    try {
      await http.put(`/laboratoire/examens/${resCible.id}/resultats`, {
        lignes: valides,
        conclusion,
      })
      Alert.alert('✅ Résultats enregistrés')
      setResCible(null)
      await chargerDetail(passage!.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setEnCours(false)
    }
  }

  async function valider(examen: any) {
    Alert.alert('Valider les résultats ?', `Les résultats de « ${examen.libelle} » seront verrouillés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui, valider',
        onPress: async () => {
          try {
            await http.post(`/laboratoire/examens/${examen.id}/valider`)
            Alert.alert('✅ Résultats validés')
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
        <Text style={styles.titre}>🧪 Laboratoire</Text>
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
          {resultats.map((r) => (
            <TouchableOpacity key={r.id} style={styles.item} onPress={() => choisirPassage(r)}>
              <Text style={styles.itemTitre}>
                {r.patient.nom} {r.patient.prenom}
              </Text>
              <Text style={styles.itemSous}>
                {r.numeroOrdre} · {r.nbExamensLab ?? 0} examen(s) payé(s)
              </Text>
            </TouchableOpacity>
          ))}
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
                  {detail?.passage?.patient?.age ?? '—'} ans · {detail?.passage?.patient?.sexe ?? '—'}
                </Text>
              </View>
              <Btn title="✕" small variant="outline" onPress={() => { setPassage(null); setDetail(null) }} />
            </View>
          </Card>

          <Card>
            <SectionTitle>Examens payés</SectionTitle>
            {lignesLab.length === 0 ? (
              <Text style={styles.vide}>Aucun examen payé pour ce passage.</Text>
            ) : (
              lignesLab.map((l: any) => (
                <View key={l.id} style={styles.ligneMed}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medNom}>{l.libelle}</Text>
                    <Badge label={statutLabel(l.examen)} tone={!l.examen ? 'muted' : l.examen.statut === 'VALIDE' ? 'success' : 'warning'} />
                  </View>
                  {!l.examen ? (
                    <Btn title="🩸 Prélèvement" small variant="outline" onPress={() => prelever(l)} />
                  ) : l.examen.statut !== 'VALIDE' ? (
                    <View style={styles.actions}>
                      <Btn title="📝 Résultats" small variant="outline" onPress={() => ouvrirResultats(l.examen)} />
                      {l.examen.statut === 'RESULTATS' && peutValider ? (
                        <Btn title="✅ Valider" small onPress={() => valider(l.examen)} />
                      ) : null}
                    </View>
                  ) : (
                    <Badge label="Validé" tone="success" />
                  )}
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}

      {/* Modale résultats */}
      {resCible ? (
        <View style={styles.modalVoile}>
          <View style={styles.modalCarte}>
            <Text style={styles.modalTitre}>📝 Résultats — {resCible.libelle}</Text>
            <ScrollView style={{ flexGrow: 0 }}>
              {lignes.map((l, i) => (
                <View key={i} style={styles.ligneRes}>
                  <TextInput style={[styles.champRes, { flex: 2 }]} placeholder="Paramètre" value={l.parametre} onChangeText={(t) => setLignes(lignes.map((x, j) => (j === i ? { ...x, parametre: t } : x)))} />
                  <TextInput style={styles.champRes} placeholder="Résultat" value={l.valeur} onChangeText={(t) => setLignes(lignes.map((x, j) => (j === i ? { ...x, valeur: t } : x)))} />
                  <TextInput style={styles.champRes} placeholder="Unité" value={l.unite} onChangeText={(t) => setLignes(lignes.map((x, j) => (j === i ? { ...x, unite: t } : x)))} />
                  <TextInput style={[styles.champRes, { flex: 1.5 }]} placeholder="Normes" value={l.normes} onChangeText={(t) => setLignes(lignes.map((x, j) => (j === i ? { ...x, normes: t } : x)))} />
                </View>
              ))}
              <Btn title="＋ Ajouter une ligne" variant="outline" small onPress={() => setLignes([...lignes, { parametre: '', valeur: '', unite: '', normes: '' }])} />
              <View style={{ marginTop: 10 }}>
                <Input label="Conclusion" value={conclusion} onChangeText={setConclusion} multiline />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Btn title="Annuler" variant="outline" onPress={() => setResCible(null)} />
              <Btn title="💾 Enregistrer" onPress={enregistrerResultats} loading={enCours} />
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
  },
  medNom: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 6 },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
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
  ligneRes: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  champRes: {
    flex: 1,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14 },
})
