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
  BoutonBascule,
} from '../components/ui'
import ListeSelect from '../components/ListeSelect'
import ListeCombo from '../components/ListeCombo'
import DateField from '../components/DateField'
import { h, imprimerA4 } from '../impressionA4'

const aujourdhuiIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MODES = [
  { value: 'ESPECES', label: '💵 Espèces' },
  { value: 'MOBILE_MONEY', label: '📱 Mobile Money' },
  { value: 'CARTE', label: '💳 Carte' },
]

type PassageRef = {
  id: number
  numeroOrdre: string
  patient: { nom: string; prenom: string; code?: string }
  /** Une entrée par ordonnance (une consultation peut en porter plusieurs). */
  ordonnances?: any[]
}

/** Quantité demandée par le médecin : « 2 plaquettes » (ancienne saisie libre affichée telle quelle). */
function quantiteDemandee(p: any) {
  const t = String(p?.quantite ?? '').trim()
  if (!t) return '—'
  if (/^\d+$/.test(t) && p.medicament) {
    const pluriel = Number(t) > 1
    const unite = p.medicament.uniteVente === 'PLAQUE' ? (pluriel ? 'plaquettes' : 'plaquette') : pluriel ? 'boîtes' : 'boîte'
    return `${t} ${unite}`
  }
  return t
}

export default function PharmacieScreen({
  navigation,
}: {
  navigation: { goBack: () => void; replace: (ecran: string) => void }
}) {
  const { user } = useAuth()
  // Bascule Pharmacie ⇄ Caisse (comme Accueil ⇄ Constante) : agents Caisse/Pharmacie et administrateur
  const peutBasculer =
    ['CAI', 'PHA'].includes(user?.personnel?.service?.code ?? '') || user?.role?.code === 'ADMINISTRATEUR'
  const cliniqueId = user?.clinique?.id ?? 1

  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [ordonnance, setOrdonnance] = useState<any>(null)
  const [quantites, setQuantites] = useState<Record<number, string>>({})
  const [modePaiement, setModePaiement] = useState('ESPECES')
  const [enCours, setEnCours] = useState(false)
  const [recu, setRecu] = useState<string | null>(null)

  // ── Stocks / Consommables (onglets web) ──
  const [ongletPharma, setOngletPharma] = useState<'ordonnances' | 'credits' | 'stocks' | 'financier' | 'externes'>('ordonnances')
  // Crédit / cas social : motif demandé avant la remise des médicaments
  const [modaleReglement, setModaleReglement] = useState<{ type: 'CREDIT' | 'CAS_SOCIAL'; motif: string } | null>(null)
  // Crédits non réglés et cas sociaux de la pharmacie
  const [creditsPharma, setCreditsPharma] = useState<{ credits: any[]; casSociaux: any[]; totalCredits: number }>({
    credits: [],
    casSociaux: [],
    totalCredits: 0,
  })
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
  const [modaleEntree, setModaleEntree] = useState<{ med: any; numeroLot: string; quantite: string; datePeremption: string; prixAchat: string; fournisseur: string } | null>(null)
  const [fournisseurs, setFournisseurs] = useState<{ value: string; label: string }[]>([])
  // Fiche d'inventaire (récapitulatif des lots comptés, imprimable A4)
  const [ficheInv, setFicheInv] = useState<{ debut: string; fin: string; donnees: any; chargement: boolean } | null>(null)
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
    if (ongletPharma === 'credits') {
      chargerCreditsPharma()
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
    setModaleEntree({ med, numeroLot: '', quantite: '', datePeremption: '', prixAchat: '', fournisseur: '' })
    chargerFournisseurs()
  }

  // ── Fiche d'inventaire ──
  async function chargerFicheInventaire(debut: string, fin: string) {
    setFicheInv((f) => ({ debut, fin, donnees: f?.donnees ?? null, chargement: true }))
    try {
      const { data } = await http.get('/pharmacie/inventaires/fiche', { params: { cliniqueId, debut, fin } })
      setFicheInv({ debut, fin, donnees: data, chargement: false })
    } catch (e: any) {
      setFicheInv({ debut, fin, donnees: null, chargement: false })
      Alert.alert('Erreur', e.response?.data?.message ?? "Fiche d'inventaire indisponible.")
    }
  }

  function imprimerFicheInventaire() {
    if (!ficheInv?.donnees) return
    const { lignes, resume } = ficheInv.donnees
    const jour = (iso: string) => iso.split('-').reverse().join('/')
    const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')
    const f = (n: number) => Number(n ?? 0).toLocaleString('fr-FR')
    const periode =
      ficheInv.debut === ficheInv.fin
        ? `Inventaire du ${jour(ficheInv.debut)}`
        : `Inventaire du ${jour(ficheInv.debut)} au ${jour(ficheInv.fin)}`
    imprimerA4(`
      <h1>${h(user?.clinique?.nom ?? '')}</h1>
      <h2>FICHE D'INVENTAIRE — PHARMACIE</h2>
      <p class="centre">${h(periode)}</p>
      <table>
        <tr>
          <td>Lots comptés : <b>${resume.lotsComptes}</b></td>
          <td>Conformes : <b>${resume.lotsConformes}</b></td>
          <td>Avec écart : <b>${resume.lotsAvecEcart}</b></td>
        </tr>
        <tr>
          <td>Quantités manquantes : <b>${resume.manquants}</b></td>
          <td>Quantités en excédent : <b>+${resume.excedents}</b></td>
          <td>Valeur des écarts : <b>${f(resume.valeurEcarts)} F</b></td>
        </tr>
        <tr><td colspan="3">Inventaire réalisé par : <b>${h((resume.agents ?? []).join(', '))}</b></td></tr>
      </table>
      <table>
        <thead><tr>
          <th>N°</th><th>Médicament</th><th>Lot</th><th>Péremption</th><th>Stock théorique</th>
          <th>Stock compté</th><th>Écart</th><th>Valeur de l'écart</th>
        </tr></thead>
        <tbody>
          ${lignes
            .map(
              (l: any, i: number) => `<tr>
                <td>${i + 1}</td><td>${h(l.medicament)}</td><td>${h(l.lot)}</td><td>${date(l.peremption)}</td>
                <td class="num">${l.stockAvant ?? '—'}</td><td class="num">${l.stockApres ?? '—'}</td>
                <td class="num"><b>${l.ecart > 0 ? '+' : ''}${l.ecart}</b></td><td class="num">${f(l.valeurEcart)} F</td>
              </tr>`,
            )
            .join('')}
        </tbody>
        <tfoot><tr class="total">
          <td colspan="6">TOTAL DES ÉCARTS</td>
          <td class="num">${resume.manquants + resume.excedents}</td><td class="num">${f(resume.valeurEcarts)} F</td>
        </tr></tfoot>
      </table>
      <div class="sign">
        <div>Le responsable de la pharmacie<br /><small>Nom, signature et date</small></div>
        <div>Le contrôleur / gestionnaire<br /><small>Nom, signature et date</small></div>
      </div>
      <p class="pied">Imprimé le ${new Date().toLocaleString('fr-FR')}</p>
    `)
  }

  // ── Réimpression du reçu d'une dispensation ──
  async function imprimerRecuPharmacie(paiementId: number) {
    try {
      const { data } = await http.post(`/impression/pharmacie-paiements/${paiementId}`)
      if (data.contenu) setRecu(data.contenu)
      Alert.alert('🖨️ Reçu', data.message ?? 'Reçu envoyé à l’imprimante du poste.')
    } catch (e: any) {
      Alert.alert('Impression', e.response?.data?.message ?? 'Impression impossible.')
    }
  }

  async function chargerFournisseurs() {
    try {
      const { data } = await http.get('/fournisseurs', { params: { cliniqueId } })
      setFournisseurs((data ?? []).map((f: any) => ({ value: f.libelle, label: f.libelle })))
    } catch {
      setFournisseurs([])
    }
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
        fournisseur: modaleEntree.fournisseur.trim() || undefined,
      })
      // Fournisseur saisi librement : ajouté automatiquement à la liste
      if (modaleEntree.fournisseur.trim()) {
        try {
          await http.post('/fournisseurs', { cliniqueId, libelle: modaleEntree.fournisseur.trim() })
        } catch {
          /* facultatif */
        }
      }
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

  async function choisirOrdonnance(o: { id: number }) {
    setRecu(null)
    try {
      const { data } = await http.get(`/pharmacie/ordonnances/${o.id}`)
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

  // Part prise en charge par l'assurance du patient (taux « médicaments » de sa formule)
  const tauxAssurance = Number(ordonnance?.assurance?.taux ?? 0)
  const partAssurance = Math.round((total * tauxAssurance) / 100)

  async function chargerCreditsPharma() {
    try {
      const { data } = await http.get('/pharmacie/credits', { params: { cliniqueId } })
      setCreditsPharma(data)
    } catch {
      setCreditsPharma({ credits: [], casSociaux: [], totalCredits: 0 })
    }
  }

  function encaisserCredit(c: any) {
    const regler = async (mode: string) => {
      try {
        await http.post(`/pharmacie/paiements/${c.id}/regler`, { modePaiement: mode })
        Alert.alert('✅ Crédit encaissé', `${c.numeroRecu} — ${Number(c.montantPatient).toLocaleString('fr-FR')} FCFA`)
        chargerCreditsPharma()
      } catch (e: any) {
        Alert.alert('Erreur', e.response?.data?.message ?? 'Encaissement impossible.')
      }
    }
    Alert.alert(
      `Encaisser ${Number(c.montantPatient).toLocaleString('fr-FR')} FCFA ?`,
      `${c.patient.nom} ${c.patient.prenom} — reçu ${c.numeroRecu}\nMode de paiement :`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: '💵 Espèces', onPress: () => regler('ESPECES') },
        { text: '📱 Mobile Money', onPress: () => regler('MOBILE_MONEY') },
      ],
    )
  }

  /** Lignes à délivrer (null si aucune quantité saisie). */
  function lignesADelivrer() {
    const trop = (ordonnance?.prescriptions ?? []).find(
      (p: any) => p.quantiteMax != null && Number(quantites[p.id] || 0) > p.quantiteMax,
    )
    if (trop) {
      Alert.alert(
        'Quantité trop élevée',
        `« ${trop.medicamentNom} » : la quantité délivrée (${quantites[trop.id]}) ne peut pas dépasser la quantité demandée par le médecin (${trop.quantiteMax}).`,
      )
      return null
    }
    const lignes = (ordonnance?.prescriptions ?? [])
      .filter((p: any) => Number(quantites[p.id]) > 0)
      .map((p: any) => ({ prescriptionId: p.id, quantiteDelivree: Number(quantites[p.id]) }))
    if (lignes.length === 0) {
      Alert.alert('Pharmacie', 'Saisissez au moins une quantité.')
      return null
    }
    return lignes
  }

  /** Crédit (payé plus tard) ou cas social (non remboursable) : motif obligatoire. */
  function ouvrirReglementSansPaiement(type: 'CREDIT' | 'CAS_SOCIAL') {
    if (!lignesADelivrer()) return
    setModaleReglement({ type, motif: type === 'CAS_SOCIAL' ? 'Patient indigent' : 'Argent pas encore disponible' })
  }
  async function confirmerReglementSansPaiement() {
    if (!modaleReglement) return
    if (!modaleReglement.motif.trim()) {
      Alert.alert('Motif', 'Indiquez le motif.')
      return
    }
    const reglement = { type: modaleReglement.type, motif: modaleReglement.motif.trim() }
    setModaleReglement(null)
    await executerDispensation(reglement)
  }

  function dispenser() {
    if (!ordonnance || !lignesADelivrer()) return
    const net = total - partAssurance
    Alert.alert(
      'Dispenser & encaisser ?',
      partAssurance > 0
        ? `Total : ${total.toLocaleString('fr-FR')} FCFA — assurance ${tauxAssurance} % : ${partAssurance.toLocaleString('fr-FR')} FCFA\nÀ encaisser : ${net.toLocaleString('fr-FR')} FCFA (${modePaiement})`
        : `Total : ${total.toLocaleString('fr-FR')} FCFA (${modePaiement})`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: () => executerDispensation() },
      ],
    )
  }

  async function executerDispensation(reglement?: { type: 'CREDIT' | 'CAS_SOCIAL'; motif: string }) {
    if (!ordonnance) return
    const lignes = lignesADelivrer()
    if (!lignes) return
    setEnCours(true)
    try {
      const d = await http.post(`/pharmacie/ordonnances/${ordonnance.ordonnance.id}/dispenser`, { lignes })
      const dispensationId = d.data.id ?? d.data.dispensation?.id
      const pay = await http.post(
        `/pharmacie/dispensations/${dispensationId}/payer`,
        reglement ? { modePaiement, type: reglement.type, motif: reglement.motif } : { modePaiement },
      )
      const numero = pay.data.paiement?.numeroRecu ?? pay.data.numeroRecu ?? ''
      Alert.alert(
        reglement ? (reglement.type === 'CAS_SOCIAL' ? '✅ Cas social enregistré' : '✅ Crédit enregistré') : '✅ Dispensation encaissée',
        `Reçu ${numero}`,
      )
      chargerCreditsPharma()
      // Impression déjà déclenchée par le backend (autoPrint) : utiliser
      // la réponse pour l'aperçu, sans second POST (double impression).
      if (pay.data.impression?.contenu) {
        setRecu(pay.data.impression.contenu)
      } else {
        setRecu(`Reçu ${numero} enregistré.`)
      }
      setOrdonnance(null)
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Dispensation impossible.')
    } finally {
      setEnCours(false)
    }
  }

  // ── Ordonnance externe (prescrite hors du centre) ──
  const ORDO_EXT_VIDE = {
    avecAssurance: false,
    patient: null as any,
    nouveau: false,
    nouveauPatient: { nom: '', prenom: '', sexe: '', telephone: '' },
    assuranceId: null as number | null,
    formuleId: null as number | null,
    numeroAssure: '',
    clientNom: '',
    prescripteur: '',
    etablissement: '',
    dateOrdonnance: aujourdhuiIso(), // date de prescription : du jour par défaut, modifiable
    lignes: [] as { medicamentId: number; nom: string; stock: number; prixVente: number; consommable: boolean; quantite: string }[],
    modePaiement: 'ESPECES',
  }
  const [ordoExtVisible, setOrdoExtVisible] = useState(false)
  const [ordoExt, setOrdoExt] = useState(ORDO_EXT_VIDE)
  const [ordoExtEnCours, setOrdoExtEnCours] = useState(false)
  const [ordoExtRecherche, setOrdoExtRecherche] = useState('')
  const [ordoExtPatients, setOrdoExtPatients] = useState<any[]>([])
  const [ordoExtMedId, setOrdoExtMedId] = useState<number | null>(null)
  const [ordoExtQte, setOrdoExtQte] = useState('1')
  // Crédit / cas social : motif saisi dans la fenêtre avant validation
  const [ordoExtReglement, setOrdoExtReglement] = useState<{ type: 'CREDIT' | 'CAS_SOCIAL'; motif: string } | null>(null)
  const [catalogueExterne, setCatalogueExterne] = useState<any[]>([])
  const [assurancesListe, setAssurancesListe] = useState<any[]>([])
  const majOrdoExt = (champs: Partial<typeof ORDO_EXT_VIDE>) => setOrdoExt((o) => ({ ...o, ...champs }))

  const optionsAssurances = assurancesListe
    .filter((a) => a.statut === 'ACTIF' && a.formules?.some((f: any) => f.statut === 'ACTIF'))
    .map((a) => ({ value: a.id, label: a.libelle }))
  const formulesExterne =
    assurancesListe.find((a) => a.id === ordoExt.assuranceId)?.formules?.filter((f: any) => f.statut === 'ACTIF') ?? []
  const optionsMedicamentsExterne = catalogueExterne
    .filter((m) => m.actif !== false && m.stock > 0)
    .map((m) => ({ value: m.id, label: `${m.nom}${m.dosage ? ` (${m.dosage})` : ''} — stock ${m.stock}` }))

  const tauxExterne = !ordoExt.avecAssurance
    ? 0
    : ordoExt.patient?.assurance
      ? Number(ordoExt.patient.assurance.taux ?? 0)
      : Number(formulesExterne.find((f: any) => f.id === ordoExt.formuleId)?.tauxPharmacie ?? 0)
  const montantLigneExterne = (l: (typeof ORDO_EXT_VIDE.lignes)[number]) =>
    l.consommable ? 0 : l.prixVente * (Number(l.quantite) || 0)
  const totalExterne = ordoExt.lignes.reduce((s, l) => s + montantLigneExterne(l), 0)
  const partAssuranceExterne = Math.round((totalExterne * tauxExterne) / 100)

  async function ouvrirOrdoExterne() {
    setOrdoExt(ORDO_EXT_VIDE)
    setOrdoExtRecherche('')
    setOrdoExtPatients([])
    setOrdoExtMedId(null)
    setOrdoExtQte('1')
    setOrdoExtReglement(null)
    setOrdoExtVisible(true)
    // Catalogue complet (stock réel) + assurances paramétrées
    const [catalogue, assurances] = await Promise.allSettled([
      http.get('/pharmacie/stocks', { params: { cliniqueId } }),
      http.get('/assurances', { params: { cliniqueId } }),
    ])
    setCatalogueExterne(catalogue.status === 'fulfilled' ? catalogue.value.data : [])
    setAssurancesListe(assurances.status === 'fulfilled' ? assurances.value.data : [])
  }

  // Recherche rapide du patient assuré (nom, code ou téléphone)
  useEffect(() => {
    const q = ordoExtRecherche.trim()
    if (!ordoExtVisible || q.length < 2) {
      setOrdoExtPatients([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/pharmacie/ordonnances-externes/patients', { params: { cliniqueId, q } })
        setOrdoExtPatients(data)
      } catch {
        setOrdoExtPatients([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [ordoExtRecherche, ordoExtVisible])

  function nouveauPatientExterne() {
    const saisie = ordoExtRecherche.trim().toUpperCase()
    const [nom = '', ...prenoms] = saisie.split(/\s+/)
    const telephone = /^\d+$/.test(nom) ? saisie : ''
    majOrdoExt({
      nouveau: true,
      patient: null,
      nouveauPatient: telephone
        ? { nom: '', prenom: '', sexe: '', telephone }
        : { nom, prenom: prenoms.join(' '), sexe: '', telephone: '' },
    })
  }

  function ajouterLigneExterne() {
    const m = catalogueExterne.find((x) => x.id === ordoExtMedId)
    const qte = Math.floor(Number(ordoExtQte) || 0)
    if (!m) return Alert.alert('Médicament', 'Choisissez un médicament.')
    if (qte <= 0) return Alert.alert('Quantité', 'Saisissez une quantité.')
    setOrdoExt((o) => {
      const existante = o.lignes.find((l) => l.medicamentId === m.id)
      const lignes = existante
        ? o.lignes.map((l) => (l.medicamentId === m.id ? { ...l, quantite: String((Number(l.quantite) || 0) + qte) } : l))
        : [
            ...o.lignes,
            {
              medicamentId: m.id,
              nom: `${m.nom}${m.dosage ? ` (${m.dosage})` : ''}`,
              stock: m.stock,
              prixVente: Number(m.prixVente ?? 0),
              consommable: !!m.consommable,
              quantite: String(qte),
            },
          ]
      return { ...o, lignes }
    })
    setOrdoExtMedId(null)
    setOrdoExtQte('1')
  }

  /** Contrôles avant envoi : message d'erreur, ou null si tout est bon. */
  function erreurOrdoExterne() {
    if (ordoExt.lignes.length === 0) return 'Ajoutez au moins un médicament.'
    const trop = ordoExt.lignes.find((l) => !(Number(l.quantite) > 0) || Number(l.quantite) > l.stock)
    if (trop) return `« ${trop.nom} » : quantité invalide (stock disponible : ${trop.stock}).`
    if (ordoExt.avecAssurance) {
      if (!ordoExt.patient && !ordoExt.nouveau) return 'Choisissez le patient ou créez-le.'
      if (ordoExt.nouveau && (!ordoExt.nouveauPatient.nom.trim() || !ordoExt.nouveauPatient.prenom.trim())) {
        return 'Le nom et les prénoms du patient sont obligatoires.'
      }
      if (!ordoExt.patient?.assurance && (!ordoExt.assuranceId || !ordoExt.formuleId)) {
        return "Choisissez l'assurance et la formule du patient."
      }
    }
    return null
  }

  function demanderReglementExterne(type: 'CREDIT' | 'CAS_SOCIAL') {
    const erreur = erreurOrdoExterne()
    if (erreur) return Alert.alert('Ordonnance externe', erreur)
    setOrdoExtReglement({ type, motif: type === 'CAS_SOCIAL' ? 'Patient indigent' : 'Argent pas encore disponible' })
  }

  async function validerOrdoExterne(reglement?: { type: 'CREDIT' | 'CAS_SOCIAL'; motif: string }) {
    const erreur = erreurOrdoExterne()
    if (erreur) return Alert.alert('Ordonnance externe', erreur)
    if (reglement && !reglement.motif.trim()) return Alert.alert('Motif', 'Indiquez le motif.')
    const assure = ordoExt.avecAssurance
    setOrdoExtEnCours(true)
    try {
      const { data } = await http.post('/pharmacie/ordonnances-externes', {
        cliniqueId,
        avecAssurance: assure,
        patientId: assure ? ordoExt.patient?.id : undefined,
        nouveauPatient: assure && !ordoExt.patient ? ordoExt.nouveauPatient : undefined,
        assurance:
          assure && !ordoExt.patient?.assurance
            ? { assuranceId: ordoExt.assuranceId, formuleId: ordoExt.formuleId, numeroAssure: ordoExt.numeroAssure }
            : undefined,
        clientNom: assure ? undefined : ordoExt.clientNom,
        prescripteur: ordoExt.prescripteur,
        etablissement: ordoExt.etablissement,
        dateOrdonnance: ordoExt.dateOrdonnance || undefined,
        lignes: ordoExt.lignes.map((l) => ({ medicamentId: l.medicamentId, quantite: Number(l.quantite) })),
        modePaiement: ordoExt.modePaiement,
        type: reglement?.type,
        motif: reglement?.motif.trim(),
      })
      setOrdoExtVisible(false)
      setOrdoExtReglement(null)
      Alert.alert('✅ Ordonnance externe enregistrée', `${data.ordonnanceExterne.numero} — reçu ${data.paiement.numeroRecu}`)
      // Impression déjà faite par le backend (autoPrint) : aperçu seulement
      setRecu(data.impression?.contenu ?? `Reçu ${data.paiement.numeroRecu} enregistré.`)
      setOngletPharma('externes')
      chargerRapportExternes()
      chargerAlertes()
      chargerCreditsPharma()
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? "Enregistrement de l'ordonnance externe impossible.")
    } finally {
      setOrdoExtEnCours(false)
    }
  }

  // ── Rapport dédié des ordonnances externes ──
  const RAPPORT_EXT_VIDE = {
    lignes: [] as any[],
    totaux: { nombre: 0, avecAssurance: 0, sansAssurance: 0, montantTotal: 0, montantAssurance: 0, montantEncaisse: 0, resteCredits: 0 },
  }
  const [rapportExternes, setRapportExternes] = useState(RAPPORT_EXT_VIDE)
  const [externesDebut, setExternesDebut] = useState('')
  const [externesFin, setExternesFin] = useState('')

  async function chargerRapportExternes(debut = externesDebut, fin = externesFin) {
    try {
      const { data } = await http.get('/pharmacie/ordonnances-externes', {
        params: { cliniqueId, debut: debut || undefined, fin: fin || undefined },
      })
      setRapportExternes(data)
    } catch {
      setRapportExternes(RAPPORT_EXT_VIDE)
    }
  }

  function reglementExterne(o: any) {
    if (o.statutPaiement === 'ANNULE') return 'Annulé'
    if (o.type === 'CREDIT') return o.regleLe ? 'Crédit réglé' : 'Crédit'
    if (o.type === 'CAS_SOCIAL') return 'Cas social'
    return MODES.find((m) => m.value === o.modePaiement)?.label ?? o.modePaiement ?? '—'
  }

  return (
    <Screen padded={false}>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.titre, { flex: 1 }]} numberOfLines={1}>
            💊 Pharmacie
          </Text>
          {peutBasculer ? <BoutonBascule label="Caisse" onPress={() => navigation.replace('Caisse')} /> : null}
        </View>
        {!ordonnance ? (
          <TextInput
            style={styles.recherche}
            placeholder="N° d'ordonnance, nom, code patient ou N° d'ordre…"
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
              if (k === 'credits') chargerCreditsPharma()
              if (k === 'externes') chargerRapportExternes()
            }}
            tabs={[
              { key: 'ordonnances', label: 'Ordonnances', count: dispensees.length },
              { key: 'credits', label: 'Crédits', count: creditsPharma.credits.length },
              { key: 'stocks', label: 'Stocks', count: alertes.stockBas.length },
              { key: 'financier', label: 'Financier' },
              { key: 'externes', label: 'Externes' },
            ]}
          />

          {ongletPharma === 'externes' ? (
            <>
              {recu ? <ApercuTexte contenu={recu} /> : null}
              <View style={{ marginBottom: 10 }}>
                <Btn title="＋ Saisir ordonnance externe" onPress={ouvrirOrdoExterne} />
              </View>
              <Card>
                <SectionTitle>📄 Rapport des ordonnances externes</SectionTitle>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <DateField
                      label="Du"
                      value={externesDebut}
                      onChange={(v) => { setExternesDebut(v); chargerRapportExternes(v, externesFin) }}
                      placeholder="Aujourd'hui"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <DateField
                      label="Au"
                      value={externesFin}
                      onChange={(v) => { setExternesFin(v); chargerRapportExternes(externesDebut, v) }}
                      placeholder="Aujourd'hui"
                    />
                  </View>
                </View>
                <InfoLigne
                  label="🧾 Ordonnances servies"
                  value={`${rapportExternes.totaux.nombre} (${rapportExternes.totaux.avecAssurance} avec / ${rapportExternes.totaux.sansAssurance} sans assurance)`}
                />
                <InfoLigne label="💊 Montant des médicaments" value={montant(rapportExternes.totaux.montantTotal)} />
                <InfoLigne label="🛡️ Part assurances" value={montant(rapportExternes.totaux.montantAssurance)} />
                <InfoLigne label="💵 Encaissé" value={montant(rapportExternes.totaux.montantEncaisse)} />
                <InfoLigne label="🎫 Crédits non réglés" value={montant(rapportExternes.totaux.resteCredits)} />
              </Card>
              <Card>
                {rapportExternes.lignes.length === 0 ? (
                  <EtatVide texte="Aucune ordonnance externe sur la période." />
                ) : (
                  rapportExternes.lignes.map((o: any) => (
                    <View key={o.id} style={[styles.item, styles.itemLigne]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitre}>
                          {o.numero} · {o.client}
                        </Text>
                        <Text style={styles.itemSous}>
                          {new Date(o.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {o.prescripteur ? ` · ${o.prescripteur}` : ''}
                          {o.etablissement ? ` (${o.etablissement})` : ''}
                        </Text>
                        <Text style={styles.itemSous}>
                          {o.medicaments.map((m: any) => `${m.nom} × ${m.quantite}`).join(', ')}
                        </Text>
                        <Text style={styles.itemMontant}>
                          {Number(o.montantTotal).toLocaleString('fr-FR')} FCFA
                          {o.montantAssurance > 0
                            ? ` · assurance ${o.assurance} (${o.tauxAssurance} %) : − ${Number(o.montantAssurance).toLocaleString('fr-FR')}`
                            : ''}
                        </Text>
                        <View style={styles.badges}>
                          <Badge label={o.avecAssurance ? 'Avec assurance' : 'Sans assurance'} tone={o.avecAssurance ? 'success' : 'muted'} />
                          <Badge
                            label={reglementExterne(o)}
                            tone={o.statutPaiement === 'ANNULE' ? 'danger' : o.type === 'CREDIT' && !o.regleLe ? 'warning' : 'muted'}
                          />
                          {o.numeroRecu ? <Text style={styles.itemSous}>{o.numeroRecu}</Text> : null}
                        </View>
                      </View>
                      {o.paiementId ? (
                        <Btn title="🖨️ Reçu" small variant="outline" onPress={() => imprimerRecuPharmacie(o.paiementId)} />
                      ) : null}
                    </View>
                  ))
                )}
              </Card>
            </>
          ) : null}

          {ongletPharma === 'credits' ? (
            <>
              <Card>
                <SectionTitle>🎫 Crédits en cours</SectionTitle>
                {creditsPharma.credits.length === 0 ? (
                  <Text style={styles.creditVide}>Aucun crédit en cours. ✅</Text>
                ) : (
                  <Text style={styles.creditVide}>
                    Total à encaisser : {creditsPharma.totalCredits.toLocaleString('fr-FR')} FCFA
                  </Text>
                )}
                {creditsPharma.credits.map((c) => (
                  <View key={c.id} style={styles.creditLigne}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.creditNom}>
                        {c.patient.nom} {c.patient.prenom}
                      </Text>
                      <Text style={styles.creditDetail}>
                        {c.numeroRecu} · {c.numeroOrdonnance ?? '—'} · {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                      </Text>
                      {c.motif ? <Text style={styles.creditDetail}>Motif : {c.motif}</Text> : null}
                      {c.patient.telephone ? <Text style={styles.creditDetail}>📞 {c.patient.telephone}</Text> : null}
                      <Text style={styles.creditMontant}>Reste dû : {Number(c.montantPatient).toLocaleString('fr-FR')} FCFA</Text>
                    </View>
                    <Btn title="💵 Encaisser" small onPress={() => encaisserCredit(c)} />
                  </View>
                ))}
              </Card>
              <Card>
                <SectionTitle>🤝 Cas sociaux pris en charge</SectionTitle>
                {creditsPharma.casSociaux.length === 0 ? <Text style={styles.creditVide}>Aucun cas social enregistré.</Text> : null}
                {creditsPharma.casSociaux.map((c) => (
                  <View key={c.id} style={styles.creditLigne}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.creditNom}>
                        {c.patient.nom} {c.patient.prenom}
                      </Text>
                      <Text style={styles.creditDetail}>
                        {c.numeroRecu} · {new Date(c.createdAt).toLocaleDateString('fr-FR')} · {c.motif ?? ''}
                      </Text>
                      <Text style={styles.creditDetail}>
                        Pris en charge : {(Number(c.montantTotal) - Number(c.montantAssurance)).toLocaleString('fr-FR')} FCFA
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

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
              <View style={{ marginBottom: 10 }}>
                <Btn title="＋ Saisir ordonnance externe" variant="outline" onPress={ouvrirOrdoExterne} />
              </View>
              {/* Une ligne par ordonnance : chacune se traite et se paie séparément */}
              {resultats.flatMap((r) =>
                (r.ordonnances ?? []).map((o: any) => (
                  <TouchableOpacity key={o.id} style={styles.item} onPress={() => choisirOrdonnance(o)}>
                    <Text style={styles.itemTitre}>
                      {r.patient.nom} {r.patient.prenom}
                    </Text>
                    <Text style={styles.itemSous}>
                      {r.numeroOrdre} · {o.numeroOrdonnance}
                      {o.ordonnanceType === 'SOINS' ? ' 💉 Soins (à remettre à l’infirmier)' : ''} · {o.medicaments?.length ?? 0} médicament(s) ·{' '}
                      {o.ordonnanceStatut === 'TRAITEE' ? 'traitée' : 'en attente'}
                    </Text>
                  </TouchableOpacity>
                )),
              )}
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
                <View style={styles.reglementsSpeciaux}>
                  <View style={{ flex: 1 }}>
                    <Btn
                      title={`✅ Valider tout (${nbSaisies()})`}
                      variant="outline"
                      disabled={nbSaisies() === 0}
                      onPress={validerInventaireGlobal}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn
                      title="🖨️ Fiche d'inventaire"
                      variant="outline"
                      onPress={() => chargerFicheInventaire(aujourdhuiIso(), aujourdhuiIso())}
                    />
                  </View>
                </View>
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
                  <Text style={styles.qteDemandee}>
                    Quantité demandée par le médecin : {quantiteDemandee(p)}
                  </Text>
                  <Text style={styles.medDetail}>
                    {[p.posologie, p.duree].filter(Boolean).join(' · ') || '—'}
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
                <View style={{ alignItems: 'flex-end' }}>
                  <TextInput
                    style={[
                      styles.qte,
                      p.quantiteMax != null && Number(quantites[p.id] || 0) > p.quantiteMax && styles.qteErreur,
                    ]}
                    keyboardType="numeric"
                    value={quantites[p.id]}
                    onChangeText={(t) => setQuantites({ ...quantites, [p.id]: t })}
                    placeholder="0"
                  />
                  {p.quantiteMax != null && Number(quantites[p.id] || 0) > p.quantiteMax ? (
                    <Text style={styles.qteMessage}>Max : {p.quantiteMax}</Text>
                  ) : p.dejaDelivree > 0 ? (
                    <Text style={styles.medDetail}>Déjà délivré : {p.dejaDelivree}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>

          <Card>
            {ordonnance.assurance ? (
              <View style={styles.assurance}>
                <Text style={styles.assuranceTexte}>
                  🛡️ {ordonnance.assurance.assurance} — {ordonnance.assurance.formule}
                  {ordonnance.assurance.numeroAssure ? ` · N° ${ordonnance.assurance.numeroAssure}` : ''}
                </Text>
                <Text style={styles.assuranceTexte}>
                  {tauxAssurance > 0
                    ? `Médicaments couverts à ${tauxAssurance} %`
                    : 'Aucun taux « médicaments » pour cette formule : le patient paie 100 %'}
                </Text>
              </View>
            ) : null}
            <View style={styles.recap}>
              <Text style={styles.recapTotal}>Total : {total.toLocaleString('fr-FR')} FCFA</Text>
              {partAssurance > 0 ? (
                <>
                  <Text style={styles.recapAssurance}>
                    Part assurance ({tauxAssurance} %) : − {partAssurance.toLocaleString('fr-FR')} FCFA
                  </Text>
                  <Text style={styles.recapTotal}>Reste à payer : {(total - partAssurance).toLocaleString('fr-FR')} FCFA</Text>
                </>
              ) : null}
            </View>
            <Input label="Mode de paiement">
              <ListeSelect value={modePaiement} options={MODES} onChange={(v) => setModePaiement(v as string)} />
            </Input>
            <Btn title="💊 Dispenser & encaisser" onPress={dispenser} loading={enCours} disabled={total === 0} />
            <View style={styles.reglementsSpeciaux}>
              <View style={{ flex: 1 }}>
                <Btn title="🎫 Crédit" variant="outline" onPress={() => ouvrirReglementSansPaiement('CREDIT')} disabled={total === 0 || enCours} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn title="🤝 Cas social" variant="outline" onPress={() => ouvrirReglementSansPaiement('CAS_SOCIAL')} disabled={total === 0 || enCours} />
              </View>
            </View>
          </Card>

          {/* Dispensations déjà faites sur cette ordonnance (réimpression du reçu) */}
          <Card>
            <SectionTitle>Dispensations de cette ordonnance</SectionTitle>
            {(ordonnance.dispensations ?? []).length === 0 ? (
              <Text style={styles.itemSous}>Aucune dispensation enregistrée.</Text>
            ) : (
              (ordonnance.dispensations ?? []).map((d: any) => (
                <View key={d.id} style={[styles.item, styles.itemLigne]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>
                      {new Date(d.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {Number(d.montantTotal ?? 0).toLocaleString('fr-FR')} FCFA
                    </Text>
                    <Text style={styles.itemSous}>
                      {(d.lignes ?? [])
                        .map((l: any) => `${l.medicamentNom} x${l.quantiteDelivree} ${l.uniteVente === 'PLAQUE' ? 'plaque(s)' : 'boîte(s)'}`)
                        .join(', ')}
                    </Text>
                    <View style={styles.badges}>
                      <Text style={styles.itemSous}>{d.paiement?.numeroRecu ?? '—'}</Text>
                      {d.paiement?.type === 'CREDIT' ? (
                        <Badge label={d.paiement.regleLe ? 'Crédit réglé' : 'Crédit'} tone="warning" />
                      ) : d.paiement?.type === 'CAS_SOCIAL' ? (
                        <Badge label="Cas social" tone="muted" />
                      ) : null}
                      {Number(d.paiement?.montantAssurance) > 0 ? <Badge label="Assurance" tone="success" /> : null}
                      <Badge label={d.statut === 'CLOTUREE' ? 'Clôturée' : 'En cours'} tone={d.statut === 'CLOTUREE' ? 'success' : 'warning'} />
                    </View>
                  </View>
                  {d.paiement ? (
                    <Btn title="🖨️ Reçu" small variant="outline" onPress={() => imprimerRecuPharmacie(d.paiement.id)} />
                  ) : null}
                </View>
              ))
            )}
          </Card>

          {recu ? <ApercuTexte contenu={recu} /> : null}
        </ScrollView>
      )}

      {/* Modale : saisie d'une ordonnance externe (prescrite hors du centre) */}
      <Modale
        visible={ordoExtVisible}
        titre="📄 Ordonnance externe"
        sousTitre="Ordonnance d'un autre établissement. Le stock diminue à la validation."
        onFermer={() => !ordoExtEnCours && setOrdoExtVisible(false)}
        actions={
          ordoExtReglement ? (
            <>
              <Btn title="Retour" small variant="outline" onPress={() => setOrdoExtReglement(null)} />
              <Btn title="Confirmer" small loading={ordoExtEnCours} onPress={() => validerOrdoExterne(ordoExtReglement)} />
            </>
          ) : (
            <>
              <Btn title="Annuler" small variant="outline" onPress={() => setOrdoExtVisible(false)} />
              <Btn title="✅ Valider & encaisser" small loading={ordoExtEnCours} onPress={() => validerOrdoExterne()} />
            </>
          )
        }
      >
        {/* 1. Avec ou sans assurance */}
        <View style={styles.extChoix}>
          {[
            { assure: true, titre: '🛡️ Avec assurance', sous: 'Patient rattaché à son assurance' },
            { assure: false, titre: '🛒 Sans assurance', sous: 'Comptant, aucun dossier patient' },
          ].map((c) => (
            <TouchableOpacity
              key={c.titre}
              style={[styles.extChoixBtn, ordoExt.avecAssurance === c.assure ? styles.extChoixActif : null]}
              onPress={() => majOrdoExt({ avecAssurance: c.assure })}
            >
              <Text style={styles.extChoixTitre}>{c.titre}</Text>
              <Text style={styles.extChoixSous}>{c.sous}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 2a. Patient assuré */}
        {ordoExt.avecAssurance ? (
          <>
            <SectionTitle>Patient</SectionTitle>
            {ordoExt.patient ? (
              <View style={styles.extPatient}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitre}>
                    {ordoExt.patient.nom} {ordoExt.patient.prenom}
                  </Text>
                  <Text style={styles.itemSous}>
                    code {ordoExt.patient.code}
                    {ordoExt.patient.telephone ? ` · 📞 ${ordoExt.patient.telephone}` : ''}
                  </Text>
                </View>
                <Btn title="Changer" small variant="outline" onPress={() => majOrdoExt({ patient: null })} />
              </View>
            ) : !ordoExt.nouveau ? (
              <>
                <Input
                  label="Rechercher (nom et prénoms, code ou téléphone)"
                  value={ordoExtRecherche}
                  onChangeText={setOrdoExtRecherche}
                />
                {ordoExtPatients.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.item}
                    onPress={() => {
                      majOrdoExt({ patient: p })
                      setOrdoExtPatients([])
                    }}
                  >
                    <Text style={styles.itemTitre}>
                      {p.nom} {p.prenom}
                    </Text>
                    <Text style={styles.itemSous}>
                      code {p.code}
                      {p.telephone ? ` · 📞 ${p.telephone}` : ''}
                    </Text>
                    <View style={styles.badges}>
                      {p.assurance ? (
                        <Badge label={`🛡️ ${p.assurance.assurance} — ${p.assurance.taux} %`} tone="success" />
                      ) : (
                        <Badge label="Sans assurance active" tone="muted" />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
                {ordoExtRecherche.trim().length >= 2 && ordoExtPatients.length === 0 ? (
                  <Text style={styles.itemSous}>Aucun patient trouvé.</Text>
                ) : null}
                <View style={{ marginTop: 8 }}>
                  <Btn title="＋ Nouveau patient" small variant="outline" onPress={nouveauPatientExterne} />
                </View>
              </>
            ) : (
              <>
                <Input
                  label="Nom *"
                  value={ordoExt.nouveauPatient.nom}
                  onChangeText={(t) => majOrdoExt({ nouveauPatient: { ...ordoExt.nouveauPatient, nom: t } })}
                />
                <Input
                  label="Prénoms *"
                  value={ordoExt.nouveauPatient.prenom}
                  onChangeText={(t) => majOrdoExt({ nouveauPatient: { ...ordoExt.nouveauPatient, prenom: t } })}
                />
                <Input label="Sexe">
                  <ListeSelect
                    value={ordoExt.nouveauPatient.sexe || null}
                    options={[
                      { value: 'M', label: 'Masculin' },
                      { value: 'F', label: 'Féminin' },
                    ]}
                    onChange={(v) => majOrdoExt({ nouveauPatient: { ...ordoExt.nouveauPatient, sexe: String(v ?? '') } })}
                  />
                </Input>
                <Input
                  label="Téléphone"
                  keyboardType="phone-pad"
                  value={ordoExt.nouveauPatient.telephone}
                  onChangeText={(t) => majOrdoExt({ nouveauPatient: { ...ordoExt.nouveauPatient, telephone: t } })}
                />
                <Btn title="← Rechercher un patient existant" small variant="outline" onPress={() => majOrdoExt({ nouveau: false })} />
              </>
            )}

            {/* Assurance : celle du patient, sinon à rattacher */}
            {ordoExt.patient?.assurance ? (
              <View style={[styles.assurance, { marginTop: 10 }]}>
                <Text style={styles.assuranceTexte}>
                  🛡️ {ordoExt.patient.assurance.assurance} — {ordoExt.patient.assurance.formule}
                  {ordoExt.patient.assurance.numeroAssure ? ` · N° ${ordoExt.patient.assurance.numeroAssure}` : ''} · médicaments
                  couverts à {ordoExt.patient.assurance.taux} %
                </Text>
              </View>
            ) : ordoExt.patient || ordoExt.nouveau ? (
              <>
                <SectionTitle>Assurance du patient</SectionTitle>
                <Input label="Assurance *">
                  <ListeSelect
                    value={ordoExt.assuranceId}
                    options={optionsAssurances}
                    onChange={(v) => majOrdoExt({ assuranceId: v == null ? null : Number(v), formuleId: null })}
                  />
                </Input>
                <Input label="Formule *">
                  <ListeSelect
                    value={ordoExt.formuleId}
                    disabled={!ordoExt.assuranceId}
                    options={formulesExterne.map((f: any) => ({
                      value: f.id,
                      label: `${f.libelle} (${f.tauxPharmacie ?? 0} % médicaments)`,
                    }))}
                    onChange={(v) => majOrdoExt({ formuleId: v == null ? null : Number(v) })}
                  />
                </Input>
                <Input label="N° assuré" value={ordoExt.numeroAssure} onChangeText={(t) => majOrdoExt({ numeroAssure: t })} />
              </>
            ) : null}
          </>
        ) : (
          <Input
            label="Nom du client (facultatif, imprimé sur le reçu)"
            placeholder="Client de passage"
            value={ordoExt.clientNom}
            onChangeText={(t) => majOrdoExt({ clientNom: t })}
          />
        )}

        {/* 3. Origine de l'ordonnance */}
        <SectionTitle>Ordonnance</SectionTitle>
        <Input label="Médecin prescripteur" value={ordoExt.prescripteur} onChangeText={(t) => majOrdoExt({ prescripteur: t })} />
        <Input label="Établissement" value={ordoExt.etablissement} onChangeText={(t) => majOrdoExt({ etablissement: t })} />
        {/* Date écrite sur l'ordonnance : date du jour par défaut, modifiable */}
        <DateField label="Date de l'ordonnance" value={ordoExt.dateOrdonnance} onChange={(v) => majOrdoExt({ dateOrdonnance: v })} />

        {/* 4. Médicaments */}
        <SectionTitle>Médicaments</SectionTitle>
        <Input label="Médicament *">
          <ListeSelect
            value={ordoExtMedId}
            options={optionsMedicamentsExterne}
            placeholder="Choisir un médicament…"
            onChange={(v) => setOrdoExtMedId(v == null ? null : Number(v))}
          />
        </Input>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input label="Quantité *" keyboardType="number-pad" value={ordoExtQte} onChangeText={setOrdoExtQte} />
          </View>
          <View style={{ marginBottom: 12 }}>
            <Btn title="＋ Ajouter" small onPress={ajouterLigneExterne} />
          </View>
        </View>
        {ordoExt.lignes.length === 0 ? <Text style={styles.itemSous}>Aucun médicament ajouté.</Text> : null}
        {ordoExt.lignes.map((l) => {
          const trop = Number(l.quantite) > l.stock
          return (
            <View key={l.medicamentId} style={[styles.item, styles.itemLigne]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.medNom}>{l.nom}</Text>
                <Text style={styles.medDetail}>
                  Stock {l.stock} · {l.consommable ? 'Consommable (non facturé)' : `${l.prixVente.toLocaleString('fr-FR')} F`} ·{' '}
                  {montantLigneExterne(l).toLocaleString('fr-FR')} F
                </Text>
                {trop ? <Text style={styles.qteMessage}>Stock disponible : {l.stock}</Text> : null}
              </View>
              <TextInput
                style={[styles.qte, trop ? styles.qteErreur : null]}
                keyboardType="number-pad"
                value={l.quantite}
                onChangeText={(t) =>
                  setOrdoExt((o) => ({
                    ...o,
                    lignes: o.lignes.map((x) => (x.medicamentId === l.medicamentId ? { ...x, quantite: t.replace(/\D/g, '') } : x)),
                  }))
                }
              />
              <TouchableOpacity
                onPress={() => setOrdoExt((o) => ({ ...o, lignes: o.lignes.filter((x) => x.medicamentId !== l.medicamentId) }))}
              >
                <Text style={styles.extRetirer}>✕</Text>
              </TouchableOpacity>
            </View>
          )
        })}

        {/* 5. Facture */}
        <View style={[styles.recap, { marginTop: 10 }]}>
          <Text style={styles.recapTotal}>Total : {totalExterne.toLocaleString('fr-FR')} FCFA</Text>
          {partAssuranceExterne > 0 ? (
            <>
              <Text style={styles.recapAssurance}>
                Part assurance ({tauxExterne} %) : − {partAssuranceExterne.toLocaleString('fr-FR')} FCFA
              </Text>
              <Text style={styles.recapTotal}>
                Reste à payer : {(totalExterne - partAssuranceExterne).toLocaleString('fr-FR')} FCFA
              </Text>
            </>
          ) : null}
        </View>
        {ordoExtReglement ? (
          <View style={styles.assurance}>
            <Text style={[styles.assuranceTexte, { fontWeight: '800', marginBottom: 6 }]}>
              {ordoExtReglement.type === 'CAS_SOCIAL'
                ? '🤝 Cas social : médicaments pris en charge par la clinique (non remboursable).'
                : '🎫 Crédit : médicaments remis maintenant, le patient paiera sa part plus tard.'}
            </Text>
            <Input
              label="Motif *"
              value={ordoExtReglement.motif}
              onChangeText={(t) => setOrdoExtReglement({ ...ordoExtReglement, motif: t })}
            />
          </View>
        ) : (
          <>
            <Input label="Mode de paiement">
              <ListeSelect value={ordoExt.modePaiement} options={MODES} onChange={(v) => majOrdoExt({ modePaiement: String(v) })} />
            </Input>
            {ordoExt.avecAssurance ? (
              <View style={styles.reglementsSpeciaux}>
                <View style={{ flex: 1 }}>
                  <Btn title="🎫 Crédit" variant="outline" onPress={() => demanderReglementExterne('CREDIT')} disabled={ordoExtEnCours} />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn title="🤝 Cas social" variant="outline" onPress={() => demanderReglementExterne('CAS_SOCIAL')} disabled={ordoExtEnCours} />
                </View>
              </View>
            ) : null}
          </>
        )}
      </Modale>

      {/* Modale : crédit / cas social (motif obligatoire) */}
      <Modale
        visible={modaleReglement !== null}
        titre={modaleReglement?.type === 'CAS_SOCIAL' ? '🤝 Cas social' : '🎫 Crédit pharmacie'}
        sousTitre={
          modaleReglement?.type === 'CAS_SOCIAL'
            ? 'Les médicaments sont remis et pris en charge par la clinique (non remboursable).'
            : 'Les médicaments sont remis maintenant. Le patient paiera sa part plus tard.'
        }
        centree
        onFermer={() => setModaleReglement(null)}
        actions={
          <>
            <Btn title="Annuler" small variant="outline" onPress={() => setModaleReglement(null)} />
            <Btn title="Confirmer" small onPress={confirmerReglementSansPaiement} loading={enCours} />
          </>
        }
      >
        <Input
          label="Motif *"
          value={modaleReglement?.motif ?? ''}
          onChangeText={(t) => modaleReglement && setModaleReglement({ ...modaleReglement, motif: t })}
        />
      </Modale>

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
        <ListeCombo
          label="Fournisseur"
          value={modaleEntree?.fournisseur ?? ''}
          options={fournisseurs}
          placeholder="Ex : COPHARMED, Laborex…"
          onChange={(v) => modaleEntree && setModaleEntree({ ...modaleEntree, fournisseur: v })}
        />
        <Text style={styles.itemSous}>Nouveau fournisseur ? Il sera ajouté automatiquement à la liste.</Text>
      </Modale>

      {/* Modale : fiche d'inventaire (récapitulatif imprimable A4) */}
      <Modale
        visible={ficheInv !== null}
        titre="🖨️ Fiche d'inventaire"
        onFermer={() => setFicheInv(null)}
        actions={
          <>
            <Btn title="Fermer" variant="outline" onPress={() => setFicheInv(null)} />
            <Btn
              title="🖨️ Imprimer (A4)"
              onPress={imprimerFicheInventaire}
              disabled={!ficheInv?.donnees?.lignes?.length}
            />
          </>
        }
      >
        <View style={styles.reglementsSpeciaux}>
          <View style={{ flex: 1 }}>
            <DateField label="Du" value={ficheInv?.debut ?? ''} onChange={(v) => ficheInv && chargerFicheInventaire(v, ficheInv.fin)} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="Au" value={ficheInv?.fin ?? ''} onChange={(v) => ficheInv && chargerFicheInventaire(ficheInv.debut, v)} />
          </View>
        </View>
        {ficheInv?.chargement ? (
          <Text style={styles.itemSous}>Chargement…</Text>
        ) : !ficheInv?.donnees?.lignes?.length ? (
          <EtatVide texte="Aucun lot compté sur cette période. Validez d'abord l'inventaire, puis revenez ici." />
        ) : (
          <>
            <Card>
              <Text style={styles.itemSous}>
                {ficheInv.donnees.resume.lotsComptes} lot(s) compté(s) · {ficheInv.donnees.resume.lotsConformes} conforme(s) ·{' '}
                {ficheInv.donnees.resume.lotsAvecEcart} avec écart
              </Text>
              <Text style={styles.itemSous}>
                Manquants : {ficheInv.donnees.resume.manquants} · Excédents : +{ficheInv.donnees.resume.excedents}
              </Text>
              <Text style={styles.itemTitre}>
                Valeur des écarts : {Number(ficheInv.donnees.resume.valeurEcarts).toLocaleString('fr-FR')} F
              </Text>
            </Card>
            {ficheInv.donnees.lignes.map((l: any) => (
              <View key={l.id} style={[styles.item, styles.itemLigne]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitre}>{l.medicament}</Text>
                  <Text style={styles.itemSous}>
                    Lot {l.lot}
                    {l.peremption ? ` · pér. ${new Date(l.peremption).toLocaleDateString('fr-FR')}` : ''} · théorique{' '}
                    {l.stockAvant ?? '—'} → compté {l.stockApres ?? '—'}
                  </Text>
                  <Text style={styles.itemSous}>
                    Valeur de l'écart : {Number(l.valeurEcart).toLocaleString('fr-FR')} F · par {l.par}
                  </Text>
                </View>
                <Badge
                  label={`${l.ecart > 0 ? '+' : ''}${l.ecart}`}
                  tone={l.ecart === 0 ? 'success' : l.ecart > 0 ? 'warning' : 'danger'}
                />
              </View>
            ))}
          </>
        )}
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
  qteErreur: { borderColor: colors.danger, borderWidth: 2 },
  qteMessage: { color: colors.danger, fontWeight: '700', fontSize: 12, marginTop: 2 },
  qteDemandee: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 2 },
  assurance: { padding: 10, marginBottom: 10, backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 10 },
  assuranceTexte: { fontSize: 12.5, color: '#1e3a8a' },
  recapAssurance: { fontSize: 13, color: '#1d4ed8', marginTop: 2 },
  reglementsSpeciaux: { flexDirection: 'row', gap: 8, marginTop: 8 },
  // Ordonnance externe
  extChoix: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  extChoixBtn: {
    flex: 1,
    padding: 10,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  extChoixActif: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  extChoixTitre: { fontSize: 14, fontWeight: '800', color: colors.text },
  extChoixSous: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  extPatient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginBottom: 6,
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 10,
  },
  extRetirer: { fontSize: 18, fontWeight: '800', color: colors.danger, paddingHorizontal: 6 },
  creditVide: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  creditLigne: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopColor: colors.border, borderTopWidth: 1 },
  creditNom: { fontSize: 14, fontWeight: '800', color: colors.text },
  creditDetail: { fontSize: 12, color: colors.textMuted },
  creditMontant: { fontSize: 13, fontWeight: '800', color: '#b45309', marginTop: 2 },
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
  itemLigne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
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
