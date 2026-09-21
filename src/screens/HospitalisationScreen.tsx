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
import ListeSelect from '../components/ListeSelect'

type Lit = {
  id: number
  label: string
  occupe: boolean
  chambre: { numero: string; typeChambre?: { libelle?: string }; tarifJournalier?: number }
  sejour?: any
}

type PassageRef = {
  id: number
  numeroOrdre: string
  patient: { nom: string; prenom: string; code?: string }
  consultation?: { hospitalisationDuree?: string; motif?: string }
}

const MOTIFS_SORTIE = [
  { value: 'EXEAT', label: 'Exéat' },
  { value: 'TRANSFERT', label: 'Transfert' },
  { value: 'DECES', label: 'Décès' },
  { value: 'AUTRE', label: 'Autre' },
]

export default function HospitalisationScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1

  const [onglet, setOnglet] = useState<'admissions' | 'occupation'>('admissions')
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [passage, setPassage] = useState<PassageRef | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [lits, setLits] = useState<Lit[]>([])
  const [litChoisi, setLitChoisi] = useState<number | null>(null)
  const [enCours, setEnCours] = useState(false)

  // Sortie
  const [sortieCible, setSortieCible] = useState<any>(null)
  const [sortieMotif, setSortieMotif] = useState('')

  useEffect(() => {
    chargerLits()
  }, [])

  async function chargerLits() {
    try {
      const { data } = await http.get('/hospitalisation/lits', { params: { cliniqueId } })
      setLits(data)
    } catch {
      /* vide */
    }
  }

  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2 || onglet !== 'admissions') {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/hospitalisation/recherche', {
          params: { code: q, cliniqueId },
        })
        setResultats(data)
      } catch {
        setResultats([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [recherche, onglet])

  async function choisirPassage(p: PassageRef) {
    setPassage(p)
    setResultats([])
    try {
      const { data } = await http.get(`/hospitalisation/passages/${p.id}`)
      setDetail(data)
    } catch {
      Alert.alert('Hospitalisation', 'Impossible de charger le passage.')
    }
  }

  const litsLibres = useMemo(
    () =>
      lits
        .filter((l) => !l.occupe && l.chambre)
        .map((l) => ({
          value: l.id,
          label: `${l.label}${l.chambre.typeChambre?.libelle ? ` (${l.chambre.typeChambre.libelle})` : ''}`,
        })),
    [lits],
  )

  const sejoursEnCours = useMemo(() => lits.filter((l) => l.occupe && l.sejour).map((l) => l.sejour), [lits])

  async function admettre() {
    if (!passage) return
    const lit = litChoisi ? lits.find((l) => l.id === litChoisi) : null
    Alert.alert(
      'Admission',
      lit
        ? `Attribuer le lit ${lit.label} à ${passage.patient.nom} ${passage.patient.prenom} ?`
        : `Admettre ${passage.patient.nom} ${passage.patient.prenom} sur le lit choisi par le médecin ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Admettre',
          onPress: async () => {
            setEnCours(true)
            try {
              await http.post(`/hospitalisation/passages/${passage.id}/admissions`, {
                litId: litChoisi ?? undefined,
                motif: detail?.passage?.consultation?.motif ?? undefined,
              })
              Alert.alert('✅ Patient admis')
              setLitChoisi(null)
              await chargerLits()
              await choisirPassage(passage)
            } catch (e: any) {
              Alert.alert('Erreur', e.response?.data?.message ?? 'Admission impossible.')
            } finally {
              setEnCours(false)
            }
          },
        },
      ],
    )
  }

  function ouvrirSortie(s: any) {
    setSortieCible(s)
    setSortieMotif('')
  }

  async function confirmerSortie() {
    if (!sortieCible || !sortieMotif) {
      Alert.alert('Sortie', 'Choisissez le motif de sortie.')
      return
    }
    Alert.alert('Confirmer la sortie ?', 'Le patient quittera son lit. La facturation a déjà été faite à l\'entrée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Sortir le patient',
        style: 'destructive',
        onPress: async () => {
          setEnCours(true)
          try {
            const { data } = await http.post(`/hospitalisation/sejours/${sortieCible.id}/sortie`, {
              sortieMotif,
            })
            Alert.alert('✅ Sortie enregistrée', `${data.nbJoursFactures} jour(s) de séjour, lit libéré.`)
            setSortieCible(null)
            await chargerLits()
            if (passage) await choisirPassage(passage)
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Sortie impossible.')
          } finally {
            setEnCours(false)
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
        <Text style={styles.titre}>🛏️ Hospitalisation</Text>
      </View>

      <View style={styles.onglets}>
        {(['admissions', 'occupation'] as const).map((o) => (
          <TouchableOpacity
            key={o}
            style={[styles.onglet, onglet === o && styles.ongletActif]}
            onPress={() => {
              setOnglet(o)
              if (o === 'occupation') chargerLits()
            }}
          >
            <Text style={[styles.ongletTexte, onglet === o && styles.ongletTexteActif]}>
              {o === 'admissions' ? 'Admissions' : 'Occupation'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {onglet === 'admissions' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {!passage ? (
            <>
              <TextInput
                style={styles.recherche}
                placeholder="Rechercher par code patient, nom ou N° d'ordre…"
                placeholderTextColor="#94a3b8"
                value={recherche}
                onChangeText={setRecherche}
              />
              {resultats.map((r) => (
                <TouchableOpacity key={r.id} style={styles.item} onPress={() => choisirPassage(r)}>
                  <Text style={styles.itemTitre}>
                    {r.patient.nom} {r.patient.prenom}
                  </Text>
                  <Text style={styles.itemSous}>
                    {r.numeroOrdre} · Prescription : {r.consultation?.hospitalisationDuree || 'durée non précisée'}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <Card>
                <View style={styles.ficheTitre}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ficheNom}>
                      {passage.patient.nom} {passage.patient.prenom} · {passage.numeroOrdre}
                    </Text>
                    <Text style={styles.ficheSous}>
                      Durée prévue : {detail?.passage?.consultation?.hospitalisationDuree ?? '—'}
                    </Text>
                  </View>
                  <Btn title="✕" small variant="outline" onPress={() => { setPassage(null); setDetail(null) }} />
                </View>
              </Card>
              {detail?.passage?.sejour ? (
                <Card>
                  <SectionTitle>Séjour en cours</SectionTitle>
                  <Text style={styles.medNom}>
                    🛏️ Lit {detail.passage.sejour.lit?.chambre?.numero}-{detail.passage.sejour.lit?.numero} · entré le{' '}
                    {new Date(detail.passage.sejour.dateEntree).toLocaleString('fr-FR')}
                  </Text>
                  <Text style={styles.ficheSous}>Facturation à l'entrée (jours × tarif de la chambre) — payable à l'entrée ou à la sortie.</Text>
                </Card>
              ) : (
                <Card>
                  <SectionTitle>Attribution du lit</SectionTitle>
                  <Input label="Lit disponible (sinon celui du médecin)">
                    <ListeSelect value={litChoisi} options={litsLibres} placeholder="— Choisir un lit —" onChange={(v) => setLitChoisi(v as number)} />
                  </Input>
                  <Btn title="🛏️ Admettre" onPress={admettre} loading={enCours} />
                </Card>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.resumeOccupation}>
            <Text style={styles.resumeTexte}>
              {lits.filter((l) => !l.occupe).length} libre(s) · {lits.filter((l) => l.occupe).length} occupé(s) ·{' '}
              {lits.length ? Math.round((lits.filter((l) => l.occupe).length / lits.length) * 100) : 0} %
            </Text>
          </View>

          <SectionTitle>Grille des lits</SectionTitle>
          <View style={styles.grilleLits}>
            {lits.map((l) => (
              <View key={l.id} style={[styles.lit, l.occupe ? styles.litOccupe : styles.litLibre]}>
                <Text style={[styles.litNumero, l.occupe && { color: '#991b1b' }]}>{l.label}</Text>
                {l.occupe ? (
                  <Text style={styles.litPatient}>
                    {l.sejour?.patient?.nom} {l.sejour?.patient?.prenom}
                  </Text>
                ) : (
                  <Text style={styles.litLibreTexte}>Libre</Text>
                )}
              </View>
            ))}
          </View>

          <SectionTitle>Séjours en cours</SectionTitle>
          {sejoursEnCours.length === 0 ? (
            <Text style={styles.vide}>Aucun patient hospitalisé actuellement.</Text>
          ) : (
            sejoursEnCours.map((s: any) => (
              <Card key={s.id}>
                <View style={styles.ficheTitre}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ficheNom}>
                      {s.patient?.nom} {s.patient?.prenom}
                    </Text>
                    <Text style={styles.ficheSous}>
                      Lit {s.lit?.chambre?.numero}-{s.lit?.numero} · depuis{' '}
                      {new Date(s.dateEntree).toLocaleDateString('fr-FR')} · {s.dureePrevue ?? '—'}
                    </Text>
                  </View>
                </View>
                <Btn title="🚪 Sortie" variant="danger" onPress={() => ouvrirSortie(s)} />
              </Card>
            ))
          )}
        </ScrollView>
      )}

      {/* Modale sortie */}
      {sortieCible ? (
        <View style={styles.modalVoile}>
          <View style={styles.modalCarte}>
            <Text style={styles.modalTitre}>
              🚪 Sortie — {sortieCible.patient?.nom} {sortieCible.patient?.prenom}
            </Text>
            <Input label="Motif de sortie">
              <ListeSelect value={sortieMotif} options={MOTIFS_SORTIE} placeholder="— Choisir —" onChange={(v) => setSortieMotif(v as string)} />
            </Input>
            <View style={styles.modalActions}>
              <Btn title="Annuler" variant="outline" onPress={() => setSortieCible(null)} />
              <Btn title="🚪 Sortir" variant="danger" onPress={confirmerSortie} loading={enCours} />
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
  onglets: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  onglet: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  ongletActif: { backgroundColor: colors.primary },
  ongletTexte: { fontWeight: '700', color: colors.textMuted, fontSize: 13 },
  ongletTexteActif: { color: '#fff' },
  recherche: {
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginBottom: 10,
  },
  item: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 12 },
  itemTitre: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  ficheTitre: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ficheNom: { fontSize: 16, fontWeight: '800', color: colors.primaryDarker },
  ficheSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  medNom: { fontSize: 14, fontWeight: '700', color: colors.text },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
  resumeOccupation: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    borderColor: '#a7f3d0',
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  resumeTexte: { color: colors.primaryDarker, fontWeight: '700', textAlign: 'center' },
  grilleLits: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  lit: {
    width: '30%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  litLibre: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  litOccupe: { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  litNumero: { fontWeight: '800', color: '#166534', fontSize: 14 },
  litPatient: { fontSize: 11, color: '#991b1b', textAlign: 'center', marginTop: 2 },
  litLibreTexte: { fontSize: 11, color: '#166534', marginTop: 2 },
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
  },
  modalTitre: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14 },
})
