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
import { ApercuTexte, Badge, Btn, Card, Chips, InfoLigne, Input, Modale, Onglets, Screen, SectionTitle,
  EtatVide,
} from '../components/ui'
import ListeSelect from '../components/ListeSelect'
import DateField from '../components/DateField'

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

  // ── Stocks / Consommables (onglets web) ──
  const [ongletPharma, setOngletPharma] = useState<'ordonnances' | 'stocks' | 'financier'>('ordonnances')
  const [sousOnglet, setSousOnglet] = useState<'entree' | 'inventaire' | 'mouvements'>('entree')
  const [mouvementMedId, setMouvementMedId] = useState<number | string | null>(null)
  const [tousLots, setTousLots] = useState<any[]>([])
  const [inventaireSaisies, setInventaireSaisies] = useState<Record<number, string>>({})
  const [mouvementListe, setMouvementListe] = useState<any[]>([])
  const [rechercheStock, setRechercheStock] = useState('')
  const [stocks, setStocks] = useState<any[]>([])
  const [alertes, setAlertes] = useState<{ stockBas: any[]; peremptions: any[] }>({ stockBas: [], peremptions: [] })
  const [consommables, setConsommables] = useState<any[]>([])
  const [dispensees, setDispensees] = useState<any[]>([])
  const [modaleEntree, setModaleEntree] = useState<{ med: any; numeroLot: string; quantite: string; datePeremption: string; prixAchat: string } | null>(null)
  const [modaleInventaire, setModaleInventaire] = useState<{ med: any; quantiteReelle: string; commentaire: string } | null>(null)
  const [modaleMouvements, setModaleMouvements] = useState<{ med: any; liste: any[] } | null>(null)
  const [modaleConso, setModaleConso] = useState<{ item: any; type: 'ENTREE' | 'SORTIE'; quantite: string; commentaire: string } | null>(null)
  const [nouveauConsoVisible, setNouveauConsoVisible] = useState(false)
  const [nouveauConso, setNouveauConso] = useState({ nom: '', unite: '', quantite: '', seuilAlerte: '' })
  const [enCoursStock, setEnCoursStock] = useState(false)

  // ── Péremptions ≤ 30 j (badge) + retraits + points financiers ──
  const [nbPeremptions30, setNbPeremptions30] = useState(0)
  const [peremptionsListe, setPeremptionsListe] = useState<any[]>([])
  const [peremptionsVisible, setPeremptionsVisible] = useState(false)
  const [retraitVisible, setRetraitVisible] = useState(false)
  const [retraitCible, setRetraitCible] = useState<any>(null)
  const [retraitForm, setRetraitForm] = useState({ quantite: '', motif: '', commentaire: '' })
  const [retraitEnCours, setRetraitEnCours] = useState(false)
  const [financier, setFinancier] = useState<any>({ recus: 0, vendus: 0, perdus: 0, correctifs: 0, restants: 0 })
  const [financierDebut, setFinancierDebut] = useState('')
  const [financierFin, setFinancierFin] = useState('')
  const [retraitsListe, setRetraitsListe] = useState<any[]>([])

  async function chargerPeremptions() {
    try {
      const { data } = await http.get('/pharmacie/peremptions', { params: { cliniqueId, jours: 30 } })
      setPeremptionsListe(data ?? [])
      setNbPeremptions30((data ?? []).length)
    } catch {
      setNbPeremptions30(0)
    }
  }

  function ouvrirPeremptions() {
    setPeremptionsVisible(true)
    chargerPeremptions()
  }

  // ── Stock bas (badge + modale) ──
  const [stockBasVisible, setStockBasVisible] = useState(false)

  function ouvrirStockBas() {
    chargerAlertes()
    setStockBasVisible(true)
  }

  function ouvrirRetrait(l: any) {
    setRetraitCible(l)
    setRetraitForm({ quantite: String(l.quantiteRestante ?? ''), motif: '', commentaire: '' })
    setPeremptionsVisible(false)
    setRetraitVisible(true)
  }

  async function confirmerRetrait() {
    if (!retraitCible || !retraitForm.quantite || !retraitForm.motif) {
      Alert.alert('Retrait', 'Renseignez la quantité et le motif.')
      return
    }
    setRetraitEnCours(true)
    try {
      await http.post(`/pharmacie/lots/${retraitCible.id}/retrait`, {
        quantite: Number(retraitForm.quantite),
        motif: retraitForm.motif,
        commentaire: retraitForm.commentaire.trim() || undefined,
      })
      Alert.alert('✅ Retrait enregistré', 'Le stock a été mis à jour.')
      setRetraitVisible(false)
      chargerAlertes()
      chargerPeremptions()
      chargerFinancier()
      // recharge les stocks
      const { data } = await http.get('/pharmacie/stocks', { params: { cliniqueId } })
      setStocks(data ?? [])
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Retrait impossible.')
    } finally {
      setRetraitEnCours(false)
    }
  }

  async function chargerFinancier() {
    try {
      const [f, r] = await Promise.all([
        http.get('/pharmacie/financier', {
          params: {
            cliniqueId,
            debut: financierDebut || undefined,
            fin: financierFin || undefined,
          },
        }),
        http.get('/pharmacie/retraits', {
          params: {
            cliniqueId,
            debut: financierDebut || undefined,
            fin: financierFin || undefined,
          },
        }),
      ])
      setFinancier(f.data ?? {})
      setRetraitsListe(r.data ?? [])
    } catch {
      /* valeurs à zéro */
    }
  }

  function montant(x: any) {
    return `${Number(x ?? 0).toLocaleString('fr-FR')} F`
  }

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

  // ── Stocks : recherche (debounce) + listes ──
  useEffect(() => {
    const q = rechercheStock.trim()
    const timer = setTimeout(async () => {
      try {
        const { data } = await http.get('/pharmacie/stocks', {
          params: { cliniqueId, ...(q ? { search: q } : {}) },
        })
        setStocks(data)
      } catch {
        setStocks([])
      }
    }, q ? 300 : 0)
    return () => clearTimeout(timer)
  }, [rechercheStock])

  async function chargerAlertes() {
    try {
      const { data } = await http.get('/pharmacie/alertes', { params: { cliniqueId } })
      setAlertes({ stockBas: data.stockBas ?? [], peremptions: data.peremptions ?? [] })
    } catch {
      setAlertes({ stockBas: [], peremptions: [] })
    }
  }

  async function chargerConsommables() {
    try {
      const { data } = await http.get('/pharmacie/consommables', { params: { cliniqueId } })
      setConsommables(data)
    } catch {
      setConsommables([])
    }
  }

  async function chargerDispensees() {
    try {
      const { data } = await http.get('/pharmacie/ordonnances', {
        params: { cliniqueId, statut: 'TRAITEE', debut: undefined, fin: undefined },
      })
      setDispensees(data.ordonnances ?? data ?? [])
    } catch {
      setDispensees([])
    }
  }

  // Chargement des onglets Stocks/Consommables à la première ouverture
  useEffect(() => {
    chargerPeremptions()
    if (ongletPharma === 'stocks') {
      chargerAlertes()
    }
    if (ongletPharma === 'ordonnances') {
      chargerDispensees()
    }
    if (ongletPharma === 'financier') {
      chargerFinancier()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ongletPharma])

  // ── Actualisation temps réel : toutes les 30 secondes ──
  useEffect(() => {
    const timer = setInterval(() => {
      chargerPeremptions()
      chargerAlertes()
      if (ongletPharma === 'financier') chargerFinancier()
    }, 30000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ongletPharma])

  // ── Détail d'un bloc financier (modale) ──
  const [detailFinVisible, setDetailFinVisible] = useState<{ type: string; titre: string } | null>(null)
  const [detailFinListe, setDetailFinListe] = useState<any[]>([])

  const LIBELLES_FIN: Record<string, string> = {
    recus: '📥 Médicaments reçus',
    vendus: '📤 Médicaments vendus',
    perdus: '🗑️ Médicaments perdus',
    correctifs: '🧮 Correctif d’inventaire',
    restants: '📦 Médicaments restants',
  }

  async function ouvrirDetailFin(type: string) {
    setDetailFinVisible({ type, titre: LIBELLES_FIN[type] ?? type })
    try {
      const { data } = await http.get('/pharmacie/financier/detail', {
        params: {
          cliniqueId,
          type,
          debut: financierDebut || undefined,
          fin: financierFin || undefined,
        },
      })
      setDetailFinListe(data ?? [])
    } catch {
      setDetailFinListe([])
    }
  }

  // ── Actions stocks ──
  function ouvrirEntree(med: any) {
    setModaleEntree({ med, numeroLot: '', quantite: '', datePeremption: '', prixAchat: '' })
  }

  async function enregistrerEntree() {
    if (!modaleEntree) return
    if (!modaleEntree.numeroLot.trim() || !Number(modaleEntree.quantite) || !modaleEntree.datePeremption) {
      Alert.alert('Entrée de stock', 'Numéro de lot, quantité et date de péremption sont obligatoires.')
      return
    }
    setEnCoursStock(true)
    try {
      await http.post('/pharmacie/entrees', {
        medicamentId: modaleEntree.med.id,
        numeroLot: modaleEntree.numeroLot.trim(),
        quantite: Number(modaleEntree.quantite),
        datePeremption: modaleEntree.datePeremption,
        prixAchat: modaleEntree.prixAchat ? Number(modaleEntree.prixAchat) : undefined,
      })
      Alert.alert('✅ Entrée enregistrée')
      setModaleEntree(null)
      chargerAlertes()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Entrée impossible.')
    } finally {
      setEnCoursStock(false)
    }
  }

  function ouvrirInventaire(med: any) {
    setModaleInventaire({ med, quantiteReelle: String(med.stock ?? 0), commentaire: '' })
  }

  async function enregistrerInventaire() {
    if (!modaleInventaire) return
    setEnCoursStock(true)
    try {
      await http.post('/pharmacie/inventaire', {
        medicamentId: modaleInventaire.med.id,
        quantiteReelle: Number(modaleInventaire.quantiteReelle) || 0,
        commentaire: modaleInventaire.commentaire || undefined,
      })
      Alert.alert('✅ Inventaire ajusté')
      setModaleInventaire(null)
      chargerAlertes()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Inventaire impossible.')
    } finally {
      setEnCoursStock(false)
    }
  }

  async function ouvrirMouvements(med: any) {
    try {
      const { data } = await http.get(`/pharmacie/mouvements/${med.id}`)
      setModaleMouvements({ med, liste: data ?? [] })
    } catch {
      setModaleMouvements({ med, liste: [] })
    }
  }

  async function recalculerSeuils() {
    try {
      await http.post('/pharmacie/seuils/recalculer', null, { params: { cliniqueId } })
      Alert.alert('✅ Seuils recalculés', 'Consommation des 30 derniers jours ÷ 30.')
      chargerAlertes()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Recalcul impossible.')
    }
  }

  async function chargerInventaireLots() {
    setTousLots([])
    setInventaireSaisies({})
    try {
      const { data } = await http.get('/pharmacie/lots', { params: { cliniqueId } })
      setTousLots(data ?? [])
    } catch {
      setTousLots([])
    }
  }

  function lotsDe(medicamentId: number) {
    return tousLots.filter((l) => l.medicamentId === medicamentId)
  }

  function ecartLot(l: any) {
    const saisie = inventaireSaisies[l.id]
    if (saisie === undefined || saisie === '') return 0
    return Number(saisie) - l.quantiteRestante
  }

  function nbSaisies() {
    return Object.values(inventaireSaisies).filter((v) => v !== '' && v !== undefined).length
  }

  async function validerInventaireLot(l: any) {
    const saisie = inventaireSaisies[l.id]
    if (saisie === undefined || saisie === '') return
    try {
      await http.post(`/pharmacie/lots/${l.id}/inventaire`, {
        quantiteReelle: Number(saisie),
        commentaire: 'Inventaire mobile',
      })
      Alert.alert('✅ Lot ajusté', `Lot ${l.numeroLot} : ${saisie} au lieu de ${l.quantiteRestante}.`)
      chargerInventaireLots()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Validation impossible.')
    }
  }

  async function validerInventaireGlobal() {
    const lignes = tousLots
      .filter((l) => {
        const s = inventaireSaisies[l.id]
        return s !== '' && s !== undefined && s !== null
      })
      .map((l) => ({ lotId: l.id, quantiteReelle: Number(inventaireSaisies[l.id]) }))
    if (lignes.length === 0) return
    Alert.alert('Valider tout l’inventaire ?', `${lignes.length} lot(s) seront ajustés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui, valider',
        onPress: async () => {
          try {
            await http.post('/pharmacie/lots/inventaire-multiple', { lignes })
            Alert.alert('✅ Inventaire validé')
            chargerInventaireLots()
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Validation impossible.')
          }
        },
      },
    ])
  }

  // ── Actions consommables ──
  function ouvrirMouvementConso(item: any, type: 'ENTREE' | 'SORTIE') {
    setModaleConso({ item, type, quantite: '', commentaire: '' })
  }

  async function enregistrerMouvementConso() {
    if (!modaleConso) return
    if (!Number(modaleConso.quantite)) {
      Alert.alert('Consommable', 'Quantité obligatoire.')
      return
    }
    setEnCoursStock(true)
    try {
      await http.post(`/pharmacie/consommables/${modaleConso.item.id}/mouvement`, {
        type: modaleConso.type,
        quantite: Number(modaleConso.quantite),
        commentaire: modaleConso.commentaire || undefined,
      })
      Alert.alert('✅ Mouvement enregistré')
      setModaleConso(null)
      chargerConsommables()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Mouvement impossible.')
    } finally {
      setEnCoursStock(false)
    }
  }

  async function creerConsommable() {
    if (!nouveauConso.nom.trim()) {
      Alert.alert('Consommable', 'Le nom est obligatoire.')
      return
    }
    setEnCoursStock(true)
    try {
      await http.post('/pharmacie/consommables', {
        cliniqueId,
        nom: nouveauConso.nom.trim(),
        unite: nouveauConso.unite || undefined,
        quantite: Number(nouveauConso.quantite) || 0,
        seuilAlerte: nouveauConso.seuilAlerte ? Number(nouveauConso.seuilAlerte) : undefined,
      })
      Alert.alert('✅ Consommable créé')
      setNouveauConsoVisible(false)
      setNouveauConso({ nom: '', unite: '', quantite: '', seuilAlerte: '' })
      chargerConsommables()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Création impossible.')
    } finally {
      setEnCoursStock(false)
    }
  }

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
    (s: number, p: any) => {
      // Les consommables ne sont pas facturés (montant = 0, comme le backend)
      if (p.medicament?.consommable) return s
      return s + (p.medicament?.prixVente ? Number(p.medicament.prixVente) * (Number(quantites[p.id]) || 0) : 0)
    },
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
            // Impression déjà déclenchée par le backend (autoPrint) : utiliser
            // la réponse pour l'aperçu, sans second POST (double impression).
            if (pay.data.impression?.contenu) {
              setRecu(pay.data.impression.contenu)
            } else {
              setRecu(`Reçu ${pay.data.numeroRecu ?? ''} enregistré.`)
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <TouchableOpacity
              style={[
                styles.badgePeremption,
                { flex: 1 },
                nbPeremptions30 > 0 ? styles.badgePeremptionActif : null,
              ]}
              onPress={ouvrirPeremptions}
            >
              <Text style={styles.badgePeremptionTexte}>
                ⏳ Péremption ≤ 30 j : {nbPeremptions30}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.badgePeremption,
                { flex: 1 },
                alertes.stockBas.length > 0 ? styles.badgeStockBasActif : null,
              ]}
              onPress={ouvrirStockBas}
            >
              <Text style={styles.badgeStockBasTexte}>
                ⚠️ Stock bas : {alertes.stockBas.length}
              </Text>
            </TouchableOpacity>
          </View>

          <Onglets
            actif={ongletPharma}
            onChange={(k) => {
              setOngletPharma(k as typeof ongletPharma)
              if (k === 'financier') chargerFinancier()
            }}
            tabs={[
              { key: 'ordonnances', label: 'Ordonnances', count: dispensees.length },
              { key: 'stocks', label: 'Stocks', count: alertes.stockBas.length },
              { key: 'financier', label: 'Financier' },
            ]}
          />

          {ongletPharma === 'financier' ? (
            <>
              <Card>
                <SectionTitle>💰 Points financiers</SectionTitle>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <DateField label="Du" value={financierDebut} onChange={(v) => { setFinancierDebut(v); chargerFinancier() }} placeholder="— —" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <DateField label="Au" value={financierFin} onChange={(v) => { setFinancierFin(v); chargerFinancier() }} placeholder="— —" />
                  </View>
                </View>
                <TouchableOpacity onPress={() => ouvrirDetailFin('recus')}>
                  <InfoLigne label="📥 Médicaments reçus 👁️" value={montant(financier.recus)} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => ouvrirDetailFin('vendus')}>
                  <InfoLigne label="📤 Médicaments vendus 👁️" value={montant(financier.vendus)} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => ouvrirDetailFin('perdus')}>
                  <InfoLigne label="🗑️ Médicaments perdus 👁️" value={montant(financier.perdus)} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => ouvrirDetailFin('correctifs')}>
                  <InfoLigne
                    label="🧮 Correctif d'inventaire 👁️"
                    value={`${financier.correctifs > 0 ? '+' : ''}${montant(financier.correctifs)}`}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => ouvrirDetailFin('restants')}>
                  <InfoLigne label="📦 Médicaments restants 👁️" value={montant(financier.restants)} />
                </TouchableOpacity>
              </Card>
              <Card>
                <SectionTitle>Rapport des retraits</SectionTitle>
                {retraitsListe.length === 0 ? (
                  <EtatVide texte="Aucun retrait sur la période." />
                ) : (
                  retraitsListe.map((r: any) => (
                    <View key={r.id} style={styles.item}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitre}>
                          {r.medicament?.nom ?? ''} — {r.reference ?? 'Retrait'}
                        </Text>
                        <Text style={styles.itemSous}>
                          {r.quantite} unité(s) · {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                          {r.utilisateur?.personnel
                            ? ` · ${r.utilisateur.personnel.nom} ${r.utilisateur.personnel.prenom}`
                            : ''}
                        </Text>
                      </View>
                      <Badge label={r.reference ?? 'Retrait'} tone="danger" />
                    </View>
                  ))
                )}
              </Card>
            </>
          ) : null}

          {ongletPharma === 'ordonnances' ? (
            <>
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
              {dispensees.length > 0 ? (
                <Card>
                  <SectionTitle>Dispensées récemment</SectionTitle>
                  {dispensees.map((d: any, i: number) => (
                    <View key={i} style={styles.item}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitre}>
                          {d.patient?.nom ?? d.passage?.patient?.nom ?? ''}{' '}
                          {d.patient?.prenom ?? d.passage?.patient?.prenom ?? ''}
                        </Text>
                        <Text style={styles.itemSous}>
                          {d.numeroOrdre ?? d.passage?.numeroOrdre ?? ''} ·{' '}
                          {d.date ? new Date(d.date).toLocaleDateString('fr-FR') : ''}
                        </Text>
                      </View>
                      <Badge label="Traitée" tone="success" />
                    </View>
                  ))}
                </Card>
              ) : null}
            </>
          ) : null}

          {ongletPharma === 'stocks' ? (
            <>
              {alertes.stockBas.length > 0 || alertes.peremptions.length > 0 ? (
                <Card>
                  <SectionTitle>⚠️ Alertes</SectionTitle>
                  {alertes.stockBas.map((m: any) => (
                    <View key={`b${m.id}`} style={styles.item}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitre}>{m.nom}</Text>
                        <Text style={styles.itemSous}>Stock bas : {m.stock}</Text>
                      </View>
                      <Badge label="Stock min" tone="danger" />
                    </View>
                  ))}
                  {alertes.peremptions.map((m: any) => (
                    <View key={`p${m.id}`} style={styles.item}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitre}>{m.nom}</Text>
                        <Text style={styles.itemSous}>Péremption ≤ 30 jours</Text>
                      </View>
                      <Badge label="Péremption" tone="warning" />
                    </View>
                  ))}
                </Card>
              ) : null}
              {alertes.stockBas.length > 0 || alertes.peremptions.length > 0 ? (
                <Card>
                  <Text style={styles.itemSous}>
                    ⚠️ {alertes.stockBas.length} médicament(s) sous le seuil ·{' '}
                    {alertes.peremptions.length} lot(s) périmé(s) ou proches
                  </Text>
                </Card>
              ) : null}

              <View style={{ marginBottom: 10 }}>
                <Btn title="🎯 Recalculer les seuils" small variant="outline" onPress={recalculerSeuils} />
              </View>

              {/* Sous-onglets : Entrée / Inventaire / Mouvements (comme le web) */}
              <Chips
                options={['Entrée', 'Inventaire', 'Mouvements']}
                value={sousOnglet === 'entree' ? 'Entrée' : sousOnglet === 'inventaire' ? 'Inventaire' : 'Mouvements'}
                onChange={(v) => {
                  const nouveau = v === 'Entrée' ? 'entree' : v === 'Inventaire' ? 'inventaire' : 'mouvements'
                  setSousOnglet(nouveau)
                  if (nouveau === 'inventaire') chargerInventaireLots()
                }}
              />

              {sousOnglet === 'inventaire' ? (
                <Btn
                  title={`✅ Valider tout l’inventaire (${nbSaisies()})`}
                  variant="outline"
                  disabled={nbSaisies() === 0}
                  onPress={validerInventaireGlobal}
                />
              ) : null}

              <Input
                label="Rechercher un médicament"
                value={rechercheStock}
                onChangeText={setRechercheStock}
                placeholder="Nom du médicament"
              />

              {sousOnglet === 'mouvements' ? (
                <>
                  <Input label="Médicament">
                    <ListeSelect
                      value={mouvementMedId}
                      options={stocks.map((m) => ({ value: m.id, label: m.nom }))}
                      placeholder="— Choisir un médicament —"
                      onChange={(v) => {
                        setMouvementMedId(v as number)
                        const med = stocks.find((x) => x.id === v)
                        if (med) {
                          http.get(`/pharmacie/mouvements/${med.id}`)
                            .then(({ data }) => setMouvementListe(data ?? []))
                            .catch(() => setMouvementListe([]))
                        }
                      }}
                    />
                  </Input>
                  {mouvementListe.length === 0 ? (
                    <EtatVide texte="Choisissez un médicament pour voir ses mouvements." />
                  ) : null}
                  {mouvementListe.map((mv: any, i: number) => (
                    <View key={i} style={styles.item}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitre}>
                          {mv.type ?? ''} {mv.quantite != null ? `${mv.quantite > 0 ? '+' : ''}${mv.quantite}` : ''}
                        </Text>
                        <Text style={styles.itemSous}>
                          {mv.date ?? mv.createdAt ? new Date(mv.date ?? mv.createdAt).toLocaleString('fr-FR') : ''}
                          {mv.numeroLot ? ` · Lot ${mv.numeroLot}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : stocks.length === 0 ? (
                <EtatVide texte="Aucun médicament en stock." />
              ) : (
                stocks.map((m) => (
                  <Card key={m.id}>
                    <Text style={styles.itemTitre}>{m.nom}</Text>
                    <Text style={styles.itemSous}>
                      Stock : {m.stock} · Seuil : {m.seuilAlerte ?? '—'} ·{' '}
                      {Number(m.prixVente ?? 0).toLocaleString('fr-FR')} F
                    </Text>
                    <View style={[styles.statutStock, { backgroundColor: m.statutStock?.couleur ?? '#64748b' }]}>
                      <Text style={styles.statutStockTexte}>{m.statutStock?.libelle ?? '—'}</Text>
                    </View>

                    {sousOnglet === 'entree' ? (
                      <>
                        {(m.lots ?? []).map((l: any) => (
                          <View key={l.id} style={styles.lotLigne}>
                            <Badge label={l.numeroLot} tone="muted" />
                            <Text style={styles.lotTexte}>
                              {l.quantiteRestante} · péremption{' '}
                              {l.datePeremption ? new Date(l.datePeremption).toLocaleDateString('fr-FR') : '—'}
                              {l.perime ? ' ⚠️ PÉRIMÉ' : l.peremptionProche ? ' ⚠️ proche' : ''}
                            </Text>
                          </View>
                        ))}
                        <Btn title="+ Entrée" small variant="outline" onPress={() => ouvrirEntree(m)} />
                      </>
                    ) : (
                      <>
                        {lotsDe(m.id).map((l: any) => {
                          const ecart = ecartLot(l)
                          return (
                            <View key={l.id} style={styles.lotInventaire}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.itemTitre}>
                                  {l.numeroLot} · péremption{' '}
                                  {l.datePeremption ? new Date(l.datePeremption).toLocaleDateString('fr-FR') : '—'}
                                </Text>
                                <Text style={styles.itemSous}>
                                  Stock actuel : {l.quantiteRestante}
                                  {inventaireSaisies[l.id] !== undefined && inventaireSaisies[l.id] !== '' ? (
                                    <Text
                                      style={{
                                        color: ecart === 0 ? '#16a34a' : ecart > 0 ? '#eab308' : '#dc2626',
                                        fontWeight: '800',
                                      }}
                                    >
                                      {' '}· Écart : {ecart > 0 ? '+' : ''}{ecart}
                                    </Text>
                                  ) : null}
                                </Text>
                              </View>
                              <TextInput
                                style={styles.inventaireChamp}
                                placeholder="Stock réel"
                                keyboardType="numeric"
                                value={inventaireSaisies[l.id] ?? ''}
                                onChangeText={(t) => setInventaireSaisies({ ...inventaireSaisies, [l.id]: t })}
                              />
                              <Btn
                                title="✅"
                                small
                                disabled={inventaireSaisies[l.id] === undefined || inventaireSaisies[l.id] === ''}
                                onPress={() => validerInventaireLot(l)}
                              />
                              <Btn
                                title="↩️"
                                small
                                variant="outline"
                                onPress={() => ouvrirRetrait(l)}
                              />
                            </View>
                          )
                        })}
                      </>
                    )}
                  </Card>
                ))
              )}

            </>
          ) : null}
        </ScrollView>
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
                      {p.medicament.consommable
                        ? 'Consommable — non facturé'
                        : `${Number(p.medicament.prixVente ?? 0).toLocaleString('fr-FR')} F/${p.medicament.uniteVente === 'PLAQUE' ? 'plaque' : 'boîte'}`}
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

      {/* Modale : entrée de stock */}
      <Modale
        visible={modaleEntree !== null}
        titre={`+ Entrée de stock — ${modaleEntree?.med.nom ?? ''}`}
        onFermer={() => setModaleEntree(null)}
        actions={
          <>
            <Btn title="Fermer" variant="outline" onPress={() => setModaleEntree(null)} />
            <Btn title="Enregistrer" onPress={enregistrerEntree} loading={enCoursStock} />
          </>
        }
      >
        <Input label="Numéro de lot *" value={modaleEntree?.numeroLot ?? ''} onChangeText={(t) => modaleEntree && setModaleEntree({ ...modaleEntree, numeroLot: t })} />
        <Input label="Quantité *" value={modaleEntree?.quantite ?? ''} onChangeText={(t) => modaleEntree && setModaleEntree({ ...modaleEntree, quantite: t })} keyboardType="numeric" />
        <Input label="Date de péremption * (AAAA-MM-JJ)" value={modaleEntree?.datePeremption ?? ''} onChangeText={(t) => modaleEntree && setModaleEntree({ ...modaleEntree, datePeremption: t })} />
        <Input label="Prix d'achat (F)" value={modaleEntree?.prixAchat ?? ''} onChangeText={(t) => modaleEntree && setModaleEntree({ ...modaleEntree, prixAchat: t })} keyboardType="numeric" />
      </Modale>

      {/* Modale : inventaire */}
      <Modale
        visible={modaleInventaire !== null}
        titre={`Inventaire — ${modaleInventaire?.med.nom ?? ''}`}
        sousTitre={`Stock enregistré : ${modaleInventaire?.med.stock ?? 0}`}
        onFermer={() => setModaleInventaire(null)}
        actions={
          <>
            <Btn title="Fermer" variant="outline" onPress={() => setModaleInventaire(null)} />
            <Btn title="Ajuster" onPress={enregistrerInventaire} loading={enCoursStock} />
          </>
        }
      >
        <Input label="Quantité réelle comptée *" value={modaleInventaire?.quantiteReelle ?? ''} onChangeText={(t) => modaleInventaire && setModaleInventaire({ ...modaleInventaire, quantiteReelle: t })} keyboardType="numeric" />
        <Input label="Commentaire" value={modaleInventaire?.commentaire ?? ''} onChangeText={(t) => modaleInventaire && setModaleInventaire({ ...modaleInventaire, commentaire: t })} />
      </Modale>

      {/* Modale : mouvements d'un médicament */}
      <Modale
        visible={modaleMouvements !== null}
        titre={`Mouvements — ${modaleMouvements?.med.nom ?? ''}`}
        onFermer={() => setModaleMouvements(null)}
      >
        {modaleMouvements && modaleMouvements.liste.length === 0 ? (
          <EtatVide texte="Aucun mouvement." />
        ) : null}
        {(modaleMouvements?.liste ?? []).map((mv: any, i: number) => (
          <View key={i} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitre}>
                {mv.type ?? ''} {mv.quantite != null ? `${mv.quantite > 0 ? '+' : ''}${mv.quantite}` : ''}
              </Text>
              <Text style={styles.itemSous}>
                {mv.date ?? mv.createdAt ? new Date(mv.date ?? mv.createdAt).toLocaleString('fr-FR') : ''}
                {mv.numeroLot ? ` · Lot ${mv.numeroLot}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </Modale>

      {/* Modale : mouvement de consommable */}
      <Modale
        visible={modaleConso !== null}
        titre={`${modaleConso?.type === 'ENTREE' ? '+' : '−'} ${modaleConso?.item.nom ?? ''}`}
        onFermer={() => setModaleConso(null)}
        actions={
          <>
            <Btn title="Fermer" variant="outline" onPress={() => setModaleConso(null)} />
            <Btn title="Enregistrer" onPress={enregistrerMouvementConso} loading={enCoursStock} />
          </>
        }
      >
        <Input label="Quantité *" value={modaleConso?.quantite ?? ''} onChangeText={(t) => modaleConso && setModaleConso({ ...modaleConso, quantite: t })} keyboardType="numeric" />
        <Input label="Commentaire" value={modaleConso?.commentaire ?? ''} onChangeText={(t) => modaleConso && setModaleConso({ ...modaleConso, commentaire: t })} />
      </Modale>

      {/* Modale : nouveau consommable */}
      <Modale
        visible={nouveauConsoVisible}
        titre="+ Nouveau consommable"
        onFermer={() => setNouveauConsoVisible(false)}
        actions={
          <>
            <Btn title="Fermer" variant="outline" onPress={() => setNouveauConsoVisible(false)} />
            <Btn title="Créer" onPress={creerConsommable} loading={enCoursStock} />
          </>
        }
      >
        <Input label="Nom *" value={nouveauConso.nom} onChangeText={(t) => setNouveauConso({ ...nouveauConso, nom: t })} />
        <Input label="Unité" value={nouveauConso.unite} onChangeText={(t) => setNouveauConso({ ...nouveauConso, unite: t })} placeholder="Ex : flacon" />
        <Input label="Quantité initiale" value={nouveauConso.quantite} onChangeText={(t) => setNouveauConso({ ...nouveauConso, quantite: t })} keyboardType="numeric" />
        <Input label="Seuil d'alerte" value={nouveauConso.seuilAlerte} onChangeText={(t) => setNouveauConso({ ...nouveauConso, seuilAlerte: t })} keyboardType="numeric" />
      </Modale>

      {/* Modale : stock bas */}
      <Modale
        visible={stockBasVisible}
        titre={`⚠️ Médicaments sous le seuil (${alertes.stockBas.length})`}
        onFermer={() => setStockBasVisible(false)}
        actions={<Btn title="Fermer" variant="outline" onPress={() => setStockBasVisible(false)} />}
      >
        {alertes.stockBas.length === 0 ? (
          <EtatVide texte="Aucun médicament sous le seuil." />
        ) : (
          alertes.stockBas.map((m: any) => (
            <View key={`sb${m.id}`} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitre}>{m.nom}</Text>
                <Text style={styles.itemSous}>
                  Stock : {m.stock} · Seuil : {m.seuilAlerte ?? '—'}
                </Text>
              </View>
              <Badge label={m.stock <= 0 ? 'Rupture' : 'Sous stock'} tone={m.stock <= 0 ? 'danger' : 'warning'} />
            </View>
          ))
        )}
      </Modale>

      {/* Modale : détail d'un bloc financier */}
      <Modale
        visible={detailFinVisible !== null}
        titre={detailFinVisible?.titre ?? ''}
        onFermer={() => setDetailFinVisible(null)}
        actions={<Btn title="Fermer" variant="outline" onPress={() => setDetailFinVisible(null)} />}
      >
        {detailFinListe.length === 0 ? (
          <EtatVide texte="Aucune ligne sur la période." />
        ) : (
          detailFinListe.map((l: any, i: number) => (
            <View key={i} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitre}>
                  {l.medicament ?? l.patient ?? `Ligne ${i + 1}`}
                </Text>
                <Text style={styles.itemSous}>
                  {l.lot ? `Lot ${l.lot} · ` : ''}
                  {l.quantite != null ? `${l.quantite} unité(s) · ` : ''}
                  {l.motif ? `${l.motif} · ` : ''}
                  {l.date ? new Date(l.date).toLocaleDateString('fr-FR') : l.peremption ?? ''}
                </Text>
              </View>
              <Text style={styles.itemMontant}>{montant(l.montant)}</Text>
            </View>
          ))
        )}
      </Modale>

      {/* Modale : péremptions ≤ 30 jours */}
      <Modale
        visible={peremptionsVisible}
        titre={`⏳ Péremptions ≤ 30 jours (${peremptionsListe.length})`}
        onFermer={() => setPeremptionsVisible(false)}
        actions={<Btn title="Fermer" variant="outline" onPress={() => setPeremptionsVisible(false)} />}
      >
        {peremptionsListe.length === 0 ? (
          <EtatVide texte="Aucun lot ne périme dans les 30 jours." />
        ) : (
          peremptionsListe.map((l: any) => (
            <View key={l.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitre}>
                  {l.medicament?.nom ?? ''} {l.medicament?.dosage ? `· ${l.medicament.dosage}` : ''}
                </Text>
                <Text style={styles.itemSous}>
                  Lot {l.numeroLot} · péremption{' '}
                  {l.datePeremption ? new Date(l.datePeremption).toLocaleDateString('fr-FR') : '—'} · stock{' '}
                  {l.quantiteRestante}
                </Text>
              </View>
              <Btn title="↩️" small variant="outline" onPress={() => ouvrirRetrait(l)} />
            </View>
          ))
        )}
      </Modale>

      {/* Modale : retrait d'un lot */}
      <Modale
        visible={retraitVisible}
        titre={`↩️ Retirer du stock — lot ${retraitCible?.numeroLot ?? ''}`}
        sousTitre={
          retraitCible
            ? `${retraitCible.medicament?.nom ?? ''} — stock actuel : ${retraitCible.quantiteRestante} unité(s)`
            : undefined
        }
        onFermer={() => setRetraitVisible(false)}
        actions={
          <>
            <Btn title="Annuler" variant="outline" onPress={() => setRetraitVisible(false)} />
            <Btn title="↩️ Retirer" onPress={confirmerRetrait} loading={retraitEnCours} />
          </>
        }
      >
        <Input
          label="Quantité à retirer *"
          value={retraitForm.quantite}
          onChangeText={(t) => setRetraitForm((f) => ({ ...f, quantite: t }))}
          keyboardType="numeric"
        />
        <Input label="Motif *">
          <ListeSelect
            value={retraitForm.motif}
            options={[
              { value: 'RETOUR_FOURNISSEUR', label: 'Retour fournisseur' },
              { value: 'PERIME', label: 'Périmé' },
              { value: 'CASSE', label: 'Casse' },
              { value: 'PERTE', label: 'Perte' },
              { value: 'AUTRE', label: 'Autre' },
            ]}
            placeholder="— Choisir —"
            onChange={(v) => setRetraitForm((f) => ({ ...f, motif: v as string }))}
          />
        </Input>
        <Input
          label="Commentaire"
          value={retraitForm.commentaire}
          onChangeText={(t) => setRetraitForm((f) => ({ ...f, commentaire: t }))}
          placeholder="Ex : boîte abîmée…"
        />
      </Modale>
    </Screen>
  )
}

const styles = StyleSheet.create({
  statutStock: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  statutStockTexte: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  lotLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingVertical: 4,
  },
  lotTexte: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  lotInventaire: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingVertical: 8,
    flexWrap: 'wrap',
  },
  badgePeremption: {
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    alignItems: 'center',
  },
  badgePeremptionActif: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  badgePeremptionTexte: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#b45309',
  },
  badgeStockBasActif: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
  },
  badgeStockBasTexte: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#b91c1c',
  },
  itemMontant: { fontSize: 13.5, fontWeight: '800', color: colors.primaryDarker },
  inventaireChamp: {
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    width: 78,
    color: colors.text,
    backgroundColor: colors.surface,
  },
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
  actionsLigne: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
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
