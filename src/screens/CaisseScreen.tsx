import React, { useEffect, useState } from 'react'
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
import { ApercuTexte, Badge, Btn, Card, Input, Screen, SectionTitle } from '../components/ui'
import ListeSelect from '../components/ListeSelect'

type Ligne = {
  id: number
  libelle: string
  montant: number
  statut: string
  service?: { nom?: string }
}

type Passage = {
  id: number
  numeroOrdre: string
  statut: string
  patient: { nom: string; prenom: string; code?: string }
  service?: { nom?: string }
}

type Paiement = {
  id: number
  numeroRecu: string
  montantTotal: number
  modePaiement: string
  statut: string
  createdAt: string
}

const MODES: { value: string; label: string }[] = [
  { value: 'ESPECES', label: '💵 Espèces' },
  { value: 'MOBILE_MONEY', label: '📱 Mobile Money' },
  { value: 'CARTE', label: '💳 Carte bancaire' },
]

export default function CaisseScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1
  const estAdmin = user?.role?.code === 'ADMINISTRATEUR'

  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<Passage[]>([])
  const [passage, setPassage] = useState<Passage | null>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [cochees, setCochees] = useState<Set<number>>(new Set())
  const [modePaiement, setModePaiement] = useState('ESPECES')
  const [encaissement, setEncaissement] = useState(false)
  const [recu, setRecu] = useState<string | null>(null)

  // Recherche (debounce 300 ms)
  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setResultats([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await http.get('/caisse/recherche', {
          params: { search: q, cliniqueId },
        })
        setResultats(data)
      } catch {
        setResultats([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [recherche])

  async function choisirPassage(p: Passage) {
    setPassage(p)
    setResultats([])
    setRecu(null)
    try {
      const { data } = await http.get(`/caisse/passages/${p.id}`)
      const lignesData: Ligne[] = data.prestations ?? data.passage?.prestations ?? []
      setLignes(lignesData)
      setPaiements(data.paiements ?? data.passage?.paiements ?? [])
      setCochees(new Set(lignesData.filter((l) => l.statut === 'EN_ATTENTE').map((l) => l.id)))
    } catch {
      Alert.alert('Caisse', 'Impossible de charger le passage.')
    }
  }

  function toggleLigne(id: number) {
    const n = new Set(cochees)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setCochees(n)
  }

  const sousTotal = lignes
    .filter((l) => l.statut === 'EN_ATTENTE' && cochees.has(l.id))
    .reduce((s, l) => s + Number(l.montant), 0)

  function statutLigneLabel(l: Ligne): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
    if (l.statut === 'PAYEE') return { label: 'Payée', tone: 'success' }
    if (l.statut === 'ANNULEE') return { label: 'Annulée', tone: 'danger' }
    if (l.statut === 'NON_PRESCRITE') return { label: 'Pas encore prescrite', tone: 'muted' }
    if (l.statut === 'EXTERNE') return { label: 'Externe (non facturable)', tone: 'muted' }
    return { label: 'En attente', tone: 'warning' }
  }

  async function encaisser() {
    if (!passage || cochees.size === 0) {
      Alert.alert('Caisse', 'Aucune prestation cochée.')
      return
    }
    Alert.alert(
      'Encaisser ?',
      `Montant : ${sousTotal.toLocaleString('fr-FR')} FCFA (${modePaiement})`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Encaisser',
          onPress: async () => {
            setEncaissement(true)
            try {
              const { data } = await http.post(`/caisse/passages/${passage.id}/encaisser`, {
                lignesIds: [...cochees],
                modePaiement,
              })
              Alert.alert('✅ Paiement enregistré', `Reçu ${data.numeroRecu ?? ''}`)
              // Reçu imprimé au poste
              try {
                const imp = await http.post(`/impression/paiements/${data.id ?? data.paiement?.id}`)
                setRecu(imp.data.contenu ?? 'Reçu imprimé au poste.')
              } catch {
                setRecu('Reçu enregistré — impression non disponible.')
              }
              await choisirPassage(passage)
            } catch (e: any) {
              const msg = e.response?.data?.message
              Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Encaissement impossible.')
            } finally {
              setEncaissement(false)
            }
          },
        },
      ],
    )
  }

  function annulerPaiement(p: Paiement) {
    Alert.prompt(
      'Annuler le paiement ?',
      `Reçu ${p.numeroRecu} — ${Number(p.montantTotal).toLocaleString('fr-FR')} FCFA. Motif :`,
      async (motif) => {
        if (!motif?.trim()) return
        try {
          await http.post(`/caisse/paiements/${p.id}/annuler`, { motif: motif.trim() })
          Alert.alert('✅ Paiement annulé')
          await choisirPassage(passage!)
        } catch (e: any) {
          Alert.alert('Erreur', e.response?.data?.message ?? 'Annulation impossible.')
        }
      },
    )
  }

  return (
    <Screen>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <Text style={styles.titre}>💰 Caisse</Text>
      </View>

      {!passage ? (
        <Card>
          <Input
            label="Rechercher (code passage, code patient ou nom)"
            value={recherche}
            onChangeText={setRecherche}
            placeholder="Ex : INT-026092026"
          />
          {resultats.map((r) => (
            <TouchableOpacity key={r.id} style={styles.item} onPress={() => choisirPassage(r)}>
              <Text style={styles.itemTitre}>
                {r.patient.nom} {r.patient.prenom}
              </Text>
              <Text style={styles.itemSous}>
                {r.numeroOrdre} · {r.patient.code} · {r.service?.nom ?? ''}
              </Text>
            </TouchableOpacity>
          ))}
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.ficheTitre}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ficheNom}>
                  {passage.patient.nom} {passage.patient.prenom}
                </Text>
                <Text style={styles.ficheSous}>
                  {passage.numeroOrdre} · code {passage.patient.code}
                </Text>
              </View>
              <Btn title="✕ Autre" small variant="outline" onPress={() => setPassage(null)} />
            </View>
          </Card>

          <Card>
            <SectionTitle>Prestations à régler</SectionTitle>
            {lignes.map((l) => {
              const statut = statutLigneLabel(l)
              const payable = l.statut === 'EN_ATTENTE'
              const grise = l.statut === 'NON_PRESCRITE' || l.statut === 'EXTERNE'
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.lignePrestation, grise && styles.ligneGrisee]}
                  onPress={() => payable && toggleLigne(l.id)}
                  disabled={!payable}
                >
                  <View style={[styles.checkbox, payable && cochees.has(l.id) && styles.checkboxCochee]}>
                    {payable && cochees.has(l.id) ? <Text style={styles.checkboxTexte}>✓</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ligneLibelle}>{l.libelle}</Text>
                    <Text style={styles.ligneService}>{l.service?.nom ?? '—'}</Text>
                  </View>
                  <Text style={styles.ligneMontant}>
                    {l.statut === 'EXTERNE' ? '—' : `${Number(l.montant).toLocaleString('fr-FR')} F`}
                  </Text>
                  <Badge label={statut.label} tone={statut.tone} />
                </TouchableOpacity>
              )
            })}

            <View style={styles.recap}>
              <Text style={styles.recapSousTotal}>
                Total à payer : <Text style={styles.recapTotal}>{sousTotal.toLocaleString('fr-FR')} FCFA</Text>
              </Text>
            </View>

            <Input label="Mode de paiement">
              <ListeSelect
                value={modePaiement}
                options={MODES}
                onChange={(v) => setModePaiement(v as string)}
              />
            </Input>
            <Btn title="💰 Encaisser" onPress={encaisser} loading={encaissement} disabled={sousTotal === 0} />
          </Card>

          <Card>
            <SectionTitle>Historique des paiements</SectionTitle>
            {paiements.length === 0 ? (
              <Text style={styles.vide}>Aucun paiement.</Text>
            ) : (
              paiements.map((p) => (
                <View key={p.id} style={styles.paiementItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paiementRecu}>{p.numeroRecu}</Text>
                    <Text style={styles.paiementInfos}>
                      {new Date(p.createdAt).toLocaleString('fr-FR')} · {p.modePaiement}
                    </Text>
                  </View>
                  <Text style={styles.paiementMontant}>
                    {Number(p.montantTotal).toLocaleString('fr-FR')} F
                  </Text>
                  <Badge label={p.statut === 'VALIDE' ? 'Validé' : 'Annulé'} tone={p.statut === 'VALIDE' ? 'success' : 'danger'} />
                  {p.statut === 'VALIDE' && estAdmin ? (
                    <Btn title="Annuler" small variant="danger" onPress={() => annulerPaiement(p)} />
                  ) : null}
                </View>
              ))
            )}
          </Card>

          {recu ? <ApercuTexte contenu={recu} /> : null}
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  bandeau: { marginBottom: 12 },
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
  titre: { fontSize: 22, fontWeight: '800', color: colors.primaryDarker, marginTop: 4 },
  item: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  itemTitre: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  ficheTitre: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ficheNom: { fontSize: 16, fontWeight: '800', color: colors.primaryDarker },
  ficheSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  lignePrestation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  ligneGrisee: { opacity: 0.45 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderColor: colors.borderChamp,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxCochee: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxTexte: { color: '#fff', fontWeight: '800' },
  ligneLibelle: { fontSize: 14, fontWeight: '700', color: colors.text },
  ligneService: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  ligneMontant: { fontSize: 13.5, fontWeight: '700', color: colors.primaryDarker },
  recap: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 12,
    alignItems: 'flex-end',
  },
  recapSousTotal: { fontSize: 14, color: colors.textMuted },
  recapTotal: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
  paiementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
    flexWrap: 'wrap',
  },
  paiementRecu: { fontWeight: '800', color: colors.text, fontSize: 13.5 },
  paiementInfos: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  paiementMontant: { fontWeight: '800', color: colors.primaryDarker, fontSize: 14 },
})
