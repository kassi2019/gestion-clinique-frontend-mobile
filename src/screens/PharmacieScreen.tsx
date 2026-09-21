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

const MODES = [
  { value: 'ESPECES', label: '💵 Espèces' },
  { value: 'MOBILE_MONEY', label: '📱 Mobile Money' },
  { value: 'CARTE', label: '💳 Carte' },
]

type PassageRef = {
  id: number
  numeroOrdre: string
  patient: { nom: string; prenom: string; code?: string }
  consultations?: any[]
}

export default function PharmacieScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1

  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [ordonnance, setOrdonnance] = useState<any>(null)
  const [quantites, setQuantites] = useState<Record<number, string>>({})
  const [modePaiement, setModePaiement] = useState('ESPECES')
  const [enCours, setEnCours] = useState(false)
  const [recu, setRecu] = useState<string | null>(null)

  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/pharmacie/ordonnances', {
          params: { code: q, cliniqueId },
        })
        setResultats(data)
      } catch {
        setResultats([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [recherche])

  async function choisirOrdonnance(p: PassageRef) {
    setRecu(null)
    try {
      const consultation = p.consultations?.[0]
      if (!consultation) {
        Alert.alert('Pharmacie', 'Aucune ordonnance pour ce passage.')
        return
      }
      const { data } = await http.get(`/pharmacie/consultations/${consultation.id}`)
      setOrdonnance(data)
      const q: Record<number, string> = {}
      for (const pres of data.prescriptions ?? []) q[pres.id] = '0'
      setQuantites(q)
      setResultats([])
    } catch {
      Alert.alert('Pharmacie', 'Impossible de charger l\'ordonnance.')
    }
  }

  const total = (ordonnance?.prescriptions ?? []).reduce(
    (s: number, p: any) =>
      s + (p.medicament?.prixVente ? Number(p.medicament.prixVente) * (Number(quantites[p.id]) || 0) : 0),
    0,
  )

  async function dispenser() {
    if (!ordonnance) return
    const lignes = (ordonnance.prescriptions ?? [])
      .filter((p: any) => Number(quantites[p.id]) > 0)
      .map((p: any) => ({ prescriptionId: p.id, quantiteDelivree: Number(quantites[p.id]) }))
    if (lignes.length === 0) {
      Alert.alert('Pharmacie', 'Saisissez au moins une quantité.')
      return
    }
    Alert.alert('Dispenser & encaisser ?', `Total : ${total.toLocaleString('fr-FR')} FCFA (${modePaiement})`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: async () => {
          setEnCours(true)
          try {
            const d = await http.post(`/pharmacie/dispensations/${ordonnance.consultation.id}`, { lignes })
            const dispensationId = d.data.id ?? d.data.dispensation?.id
            const pay = await http.post(`/pharmacie/dispensations/${dispensationId}/payer`, { modePaiement })
            Alert.alert('✅ Dispensation encaissée', `Reçu ${pay.data.numeroRecu ?? ''}`)
            try {
              const imp = await http.post(`/impression/pharmacie-paiements/${pay.data.id ?? pay.data.paiement?.id}`)
              setRecu(imp.data.contenu ?? 'Reçu imprimé au poste.')
            } catch {
              setRecu('Reçu enregistré — impression non disponible.')
            }
            setOrdonnance(null)
          } catch (e: any) {
            const msg = e.response?.data?.message
            Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Dispensation impossible.')
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
        <Text style={styles.titre}>💊 Pharmacie</Text>
        {!ordonnance ? (
          <TextInput
            style={styles.recherche}
            placeholder="Rechercher par code patient, nom ou N° d'ordre…"
            placeholderTextColor="#94a3b8"
            value={recherche}
            onChangeText={setRecherche}
          />
        ) : null}
      </View>

      {!ordonnance ? (
        <View style={{ padding: 16 }}>
          {resultats.map((r) => (
            <TouchableOpacity key={r.id} style={styles.item} onPress={() => choisirOrdonnance(r)}>
              <Text style={styles.itemTitre}>
                {r.patient.nom} {r.patient.prenom}
              </Text>
              <Text style={styles.itemSous}>
                {r.numeroOrdre} · {r.consultations?.length ?? 0} ordonnance(s)
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
                  {ordonnance.consultation.patient.nom} {ordonnance.consultation.patient.prenom}
                </Text>
                <Text style={styles.ficheSous}>
                  {ordonnance.consultation.patient.code} · Dr {ordonnance.consultation.medecin?.personnel?.nom ?? '—'}
                </Text>
              </View>
              <Btn title="✕" small variant="outline" onPress={() => setOrdonnance(null)} />
            </View>
          </Card>

          <Card>
            <SectionTitle>Ordonnance</SectionTitle>
            {(ordonnance.prescriptions ?? []).map((p: any) => (
              <View key={p.id} style={styles.ligneMed}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medNom}>
                    {p.medicamentNom}
                    {p.forme ? ` (${p.forme})` : ''}
                  </Text>
                  <Text style={styles.medDetail}>
                    {[p.posologie, p.quantite, p.duree].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  {p.medicament ? (
                    <Text style={styles.medDetail}>
                      Stock : {p.medicament.stock} {p.medicament.uniteVente === 'PLAQUE' ? 'plaques' : 'boîtes'} ·{' '}
                      {Number(p.medicament.prixVente ?? 0).toLocaleString('fr-FR')} F/{p.medicament.uniteVente === 'PLAQUE' ? 'plaque' : 'boîte'}
                    </Text>
                  ) : (
                    <Badge label="Hors catalogue" tone="warning" />
                  )}
                </View>
                <TextInput
                  style={styles.qte}
                  keyboardType="numeric"
                  value={quantites[p.id]}
                  onChangeText={(t) => setQuantites({ ...quantites, [p.id]: t })}
                  placeholder="0"
                />
              </View>
            ))}
          </Card>

          <Card>
            <View style={styles.recap}>
              <Text style={styles.recapTotal}>Total : {total.toLocaleString('fr-FR')} FCFA</Text>
            </View>
            <Input label="Mode de paiement">
              <ListeSelect value={modePaiement} options={MODES} onChange={(v) => setModePaiement(v as string)} />
            </Input>
            <Btn title="💊 Dispenser & encaisser" onPress={dispenser} loading={enCours} disabled={total === 0} />
          </Card>

          {recu ? <ApercuTexte contenu={recu} /> : null}
        </ScrollView>
      )}
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
  medNom: { fontSize: 14, fontWeight: '700', color: colors.text },
  medDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  qte: {
    width: 64,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 15,
    textAlign: 'center',
    backgroundColor: colors.surface,
  },
  recap: { alignItems: 'flex-end', marginBottom: 10 },
  recapTotal: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker },
})
