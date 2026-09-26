import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Modal,
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
  ApercuTexte,
  Badge,
  Btn,
  Card,
  InfoLigne,
  Input,
  Modale,
  PaginationBar,
  Screen,
  SectionTitle,
} from '../components/ui'
import ListeSelect from '../components/ListeSelect'
import ListeCombo from '../components/ListeCombo'
import DateField from '../components/DateField'

type Patient = { id: number; nom: string; prenom: string; code: string; age?: string; sexe?: string }
type Service = { id: number; nom: string }
type Prestation = { id: number; libelle: string; type: string; montant: number; actif: boolean; serviceId: number }
type PassageJour = {
  id: number
  numeroOrdre: string
  statut: string
  patient: {
    nom: string
    prenom: string
    age?: string
    dateNaissance?: string
    numeroCni?: string
    numeroCmu?: string
    sexe?: string
    telephone?: string
    ville?: string
    quartier?: string
    profession?: string
  }
  service?: { nom: string }
  serviceId?: number
  typePatient?: string
  motif?: string
  referent?: string
  prestationDemandee?: string
  taille?: string
  temperature?: number | null
  pouls?: number | null
  tensionGauche?: string
  tensionDroite?: string
  poids?: number | null
  perimetreBrachial?: string
  perimetreCranien?: string
}

export default function AccueilScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user, canAccess } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1

  // Poste : le service CONSTANTE voit uniquement les constantes ; le bouton
  // « Basculer » permet d'aller vers l'Enregistrement et inversement (comme le web).
  const serviceCode = user?.personnel?.service?.code
  const peutBasculer = serviceCode === 'ACC' || serviceCode === 'CON'
  const [posteConstante, setPosteConstante] = useState(serviceCode === 'CON')

  const [onglet, setOnglet] = useState<'nouveau' | 'jour' | 'constantes'>(
    serviceCode === 'CON' ? 'constantes' : 'nouveau',
  )

  function basculerPoste() {
    const cible = !posteConstante
    setPosteConstante(cible)
    if (cible) chargerConstantes()
    else chargerJour(1)
  }

  // Référentiels
  const [services, setServices] = useState<Service[]>([])
  const [prestations, setPrestations] = useState<Prestation[]>([])

  // Formulaire
  const [modePatient, setModePatient] = useState<'existant' | 'nouveau'>('nouveau')
  const [recherchePatient, setRecherchePatient] = useState('')
  const [resultatsPatients, setResultatsPatients] = useState<Patient[]>([])
  const [patientChoisi, setPatientChoisi] = useState<Patient | null>(null)
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [age, setAge] = useState('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [cni, setCni] = useState('')
  const [cmu, setCmu] = useState('')

  // ── Calcul automatique âge ⇄ date de naissance ──
  function ageDepuisNaissance(d: string): string {
    if (!d) return ''
    const date = new Date(d)
    if (isNaN(date.getTime())) return ''
    const now = new Date()
    let a = now.getFullYear() - date.getFullYear()
    const m = now.getMonth() - date.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < date.getDate())) a--
    return a >= 0 && a <= 150 ? String(a) : ''
  }

  function naissanceDepuisAge(a: string): string {
    const n = parseInt(a, 10)
    if (isNaN(n) || n < 0 || n > 150) return ''
    const d = new Date()
    d.setFullYear(d.getFullYear() - n)
    return d.toISOString().slice(0, 10)
  }

  /** Âge saisi → date de naissance renseignée automatiquement (et inversement). */
  function changerAge(v: string) {
    setAge(v)
    if (v && !dateNaissance) setDateNaissance(naissanceDepuisAge(v))
  }

  function changerDateNaissance(v: string) {
    setDateNaissance(v)
    const a = ageDepuisNaissance(v)
    if (a) setAge(a)
  }

  // ── N° CNI / N° CMU uniques : si le patient existe, il s'affiche automatiquement ──
  let identifiantTimer: ReturnType<typeof setTimeout> | null = null

  function verifierIdentifiant(v: string) {
    const t = v.trim()
    if (identifiantTimer) clearTimeout(identifiantTimer)
    if (modePatient !== 'nouveau' || t.length < 3) return
    identifiantTimer = setTimeout(async () => {
      try {
        const { data } = await http.get('/accueil/patients', {
          params: { search: t, cliniqueId },
        })
        const exact = (data ?? []).find(
          (p: any) => p.numeroCni === t || p.numeroCmu === t,
        )
        if (exact) {
          utiliserPatientExistant(exact)
        }
      } catch {
        /* facultatif */
      }
    }, 400)
  }

  function changerCni(v: string) {
    setCni(v)
    verifierIdentifiant(v)
  }

  function changerCmu(v: string) {
    setCmu(v)
    verifierIdentifiant(v)
  }
  const [sexe, setSexe] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('')
  const [quartier, setQuartier] = useState('')
  const [profession, setProfession] = useState('')
  const [motif, setMotif] = useState('')
  const [serviceId, setServiceId] = useState<number | null>(null)
  const [typePatient, setTypePatient] = useState<'INTERNE' | 'EXTERNE'>('INTERNE')
  const [referent, setReferent] = useState('')
  const [prestationDemandee, setPrestationDemandee] = useState('')
  const [consultationId, setConsultationId] = useState<number | null>(null)
  const [actePrestationId, setActePrestationId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)

  // Liste du jour
  const [passages, setPassages] = useState<PassageJour[]>([])
  const [page, setPage] = useState(1)
  const [totalPagesJour, setTotalPagesJour] = useState(1)
  const [rechercheJour, setRechercheJour] = useState('')
  const [chargementListe, setChargementListe] = useState(false)
  const [filtreServiceJour, setFiltreServiceJour] = useState<number | null>(null)
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const [compteurs, setCompteurs] = useState({ attente: 0, terminee: 0, jour: 0 })

  // ── Assurance patient (patient existant) ──
  const [assuranceVisible, setAssuranceVisible] = useState(false)
  const [assurances, setAssurances] = useState<
    { value: number; label: string; formules: { id: number; libelle: string }[] }[]
  >([])
  const [rattachements, setRattachements] = useState<any[]>([])
  const [assuranceId, setAssuranceId] = useState<number | null>(null)
  const [formuleId, setFormuleId] = useState<number | null>(null)
  const [numeroAssure, setNumeroAssure] = useState('')
  const [numeroCarte, setNumeroCarte] = useState('')
  const [nomAssurePrincipal, setNomAssurePrincipal] = useState('')
  const [typeBeneficiaire, setTypeBeneficiaire] = useState<string | null>(null)
  const [debutCouverture, setDebutCouverture] = useState('')
  const [finCouverture, setFinCouverture] = useState('')
  const [savingAssurance, setSavingAssurance] = useState(false)

  // ── Modification d'un passage ──
  const [modifVisible, setModifVisible] = useState(false)
  const [modifCible, setModifCible] = useState<PassageJour | null>(null)
  const [modifForm, setModifForm] = useState({
    nom: '',
    prenom: '',
    age: '',
    dateNaissance: '',
    numeroCni: '',
    numeroCmu: '',
    sexe: '',
    telephone: '',
    ville: '',
    quartier: '',
    profession: '',
    serviceId: null as number | null,
    typePatient: 'INTERNE' as 'INTERNE' | 'EXTERNE',
    motif: '',
    referent: '',
    prestationDemandee: '',
  })
  const [savingModif, setSavingModif] = useState(false)

  // Constantes
  const [filtreConstantes, setFiltreConstantes] = useState<'NON' | 'OUI'>('NON')
  const [passagesConstantes, setPassagesConstantes] = useState<PassageJour[]>([])
  const [chargementConstantes, setChargementConstantes] = useState(false)
  const [constanteCible, setConstanteCible] = useState<PassageJour | null>(null)
  const [formConst, setFormConst] = useState({ taille: '', temperature: '', pouls: '', tensionGauche: '', tensionDroite: '', poids: '', perimetreBrachial: '', perimetreCranien: '' })
  const [savingConst, setSavingConst] = useState(false)

  // ── Listes déroulantes (profession, résidence/ville, quartier, motif) ──
  const [listes, setListes] = useState<{
    profession: { value: string; label: string }[]
    residence: { value: string; label: string }[]
    quartier: { value: string; label: string }[]
    motif: { value: string; label: string }[]
  }>({ profession: [], residence: [], quartier: [], motif: [] })

  async function chargerListes() {
    try {
      const [p, r, q, m] = await Promise.all([
        http.get('/professions', { params: { cliniqueId } }),
        http.get('/residences', { params: { cliniqueId } }),
        http.get('/quartiers', { params: { cliniqueId } }),
        http.get('/motifs', { params: { cliniqueId } }),
      ])
      const opts = (data: any[]) =>
        (data ?? []).map((x) => ({ value: x.libelle, label: x.libelle }))
      setListes({
        profession: opts(p.data),
        residence: opts(r.data),
        quartier: opts(q.data),
        motif: opts(m.data),
      })
    } catch {
      /* listes vides */
    }
  }

  /** Ajoute silencieusement un nouveau libellé à sa liste (auto-alimentation). */
  async function ajouterListe(code: string, libelle: string) {
    const routes: Record<string, string> = {
      profession: '/professions',
      residence: '/residences',
      quartier: '/quartiers',
      motif: '/motifs',
    }
    try {
      await http.post(routes[code], { cliniqueId, libelle: libelle.trim() })
      chargerListes()
    } catch {
      /* facultatif */
    }
  }

  useEffect(() => {
    chargerListes()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const [s, p] = await Promise.all([
          http.get('/services', { params: { perPage: 0 } }),
          http.get('/prestations', { params: { perPage: 0, cliniqueId } }),
        ])
        setServices(s.data.data ?? [])
        setPrestations(p.data.data ?? [])
      } catch {
        /* listes vides */
      }
      chargerJour()
      chargerCompteurs()
    })()
  }, [])

  const consultationsDuService = useMemo(
    () =>
      prestations.filter(
        (p) => p.actif && p.type === 'CONSULTATION' && p.serviceId === serviceId,
      ),
    [prestations, serviceId],
  )

  /** Actes du service (échographies, examens…) : l'agent peut en choisir un à payer. */
  const actesDuService = useMemo(
    () =>
      prestations.filter(
        (p) => p.actif && p.type !== 'CONSULTATION' && p.serviceId === serviceId,
      ),
    [prestations, serviceId],
  )

  useEffect(() => {
    setConsultationId(consultationsDuService.length === 1 ? consultationsDuService[0].id : null)
  }, [consultationsDuService])

  // ── Recherche patient existant (debounce) ──
  useEffect(() => {
    const q = recherchePatient.trim()
    if (modePatient !== 'existant' || q.length < 2) {
      setResultatsPatients([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await http.get('/accueil/patients', {
          params: { search: q, cliniqueId },
        })
        setResultatsPatients(data)
      } catch {
        setResultatsPatients([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [recherchePatient, modePatient])

  // ── Garde-fou anti-doublon : pendant la saisie du nom d'un nouveau patient ──
  const [doublons, setDoublons] = useState<any[]>([])

  useEffect(() => {
    const q = nom.trim()
    if (modePatient !== 'nouveau' || q.length < 3) {
      setDoublons([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await http.get('/accueil/patients', {
          params: { search: q, cliniqueId },
        })
        setDoublons(data ?? [])
      } catch {
        setDoublons([])
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [nom, modePatient])

  /** Le patient existe déjà : on bascule sur son dossier. */
  function utiliserPatientExistant(pt: any) {
    setModePatient('existant')
    setPatientChoisi(pt)
    setRecherchePatient(pt.nom)
    setDoublons([])
    Alert.alert('✅ Patient existant', `${pt.nom} ${pt.prenom} (code ${pt.code}) sélectionné.`)
  }

  async function chargerJour(p = 1) {
    setChargementListe(true)
    try {
      const { data } = await http.get('/accueil/passages', {
        params: {
          cliniqueId,
          search: rechercheJour.trim() || undefined,
          serviceId: filtreServiceJour ?? undefined,
          debut: filtreDebut || undefined,
          fin: filtreFin || undefined,
          page: p,
          perPage: 20,
        },
      })
      setPassages(data.data ?? [])
      setPage(p)
      setTotalPagesJour(data.totalPages ?? 1)
    } catch {
      setPassages([])
    } finally {
      setChargementListe(false)
    }
  }

  // Recherche/filtres de la liste du jour : une seule requête après 300 ms
  // (pas d'appel à chaque frappe).
  useEffect(() => {
    if (onglet !== 'jour') return
    const timer = setTimeout(() => chargerJour(1), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechercheJour, filtreServiceJour, filtreDebut, filtreFin])

  /** Compteurs des onglets (badges) : attente / terminées / total du jour. */
  async function chargerCompteurs() {
    try {
      const [a, t, j] = await Promise.all([
        http.get('/accueil/passages', { params: { cliniqueId, constantes: 'NON', perPage: 1 } }),
        http.get('/accueil/passages', { params: { cliniqueId, constantes: 'OUI', perPage: 1 } }),
        http.get('/accueil/passages', { params: { cliniqueId, page: 1, perPage: 1 } }),
      ])
      setCompteurs({
        attente: a.data.total ?? 0,
        terminee: t.data.total ?? 0,
        jour: j.data.total ?? 0,
      })
    } catch {
      /* compteurs à zéro */
    }
  }

  // ── Constantes ──
  async function chargerConstantes() {
    setChargementConstantes(true)
    try {
      const { data } = await http.get('/accueil/passages', {
        params: { cliniqueId, constantes: filtreConstantes, page: 1, perPage: 50 },
      })
      setPassagesConstantes(data.data ?? [])
    } catch {
      setPassagesConstantes([])
    } finally {
      setChargementConstantes(false)
    }
  }

  function ouvrirConstantes(p: PassageJour & Partial<PassageJour>) {
    setConstanteCible(p as PassageJour)
    setFormConst({
      taille: p.taille ?? '',
      temperature: p.temperature != null ? String(p.temperature) : '',
      pouls: p.pouls != null ? String(p.pouls) : '',
      tensionGauche: p.tensionGauche ?? '',
      tensionDroite: p.tensionDroite ?? '',
      poids: p.poids != null ? String(p.poids) : '',
      perimetreBrachial: p.perimetreBrachial ?? '',
      perimetreCranien: p.perimetreCranien ?? '',
    })
  }

  async function enregistrerConstantes() {
    if (!constanteCible) return
    // Tensions artérielles obligatoires, au format x/y (ex : 12/8) — comme le web
    const RE_TA = /^\d{1,3}\/\d{1,3}$/
    if (!RE_TA.test(formConst.tensionGauche.trim())) {
      Alert.alert('Constantes', 'Tension artérielle gauche obligatoire : format « x/y » (ex : 12/8).')
      return
    }
    if (!RE_TA.test(formConst.tensionDroite.trim())) {
      Alert.alert('Constantes', 'Tension artérielle droite obligatoire : format « x/y » (ex : 12/8).')
      return
    }
    setSavingConst(true)
    try {
      await http.patch(`/accueil/passages/${constanteCible.id}`, {
        taille: formConst.taille || undefined,
        temperature: formConst.temperature ? Number(formConst.temperature) : undefined,
        pouls: formConst.pouls ? Number(formConst.pouls) : undefined,
        tensionGauche: formConst.tensionGauche || undefined,
        tensionDroite: formConst.tensionDroite || undefined,
        poids: formConst.poids ? Number(formConst.poids) : undefined,
        perimetreBrachial: formConst.perimetreBrachial || undefined,
        perimetreCranien: formConst.perimetreCranien || undefined,
      })
      Alert.alert('✅ Constantes enregistrées', `Passage ${constanteCible.numeroOrdre}`)
      setConstanteCible(null)
      chargerConstantes()
      chargerJour(1)
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Enregistrement impossible.')
    } finally {
      setSavingConst(false)
    }
  }

  async function imprimerTicket(passageId: number, numeroOrdre: string) {
    try {
      const { data } = await http.post(`/impression/passages/${passageId}`)
      if (data.ok) {
        setTicket(data.contenu ?? `Ticket ${numeroOrdre} imprimé.`)
        Alert.alert('🖨️ Ticket', `Ticket ${numeroOrdre} envoyé à l'imprimante du poste.`)
      } else {
        setTicket(data.contenu ?? '')
        Alert.alert('🖨️ Ticket', 'Impression non configurée — aperçu affiché.')
      }
    } catch {
      Alert.alert('🖨️ Ticket', 'Impression impossible.')
    }
  }

  async function enregistrerPassage() {
    if (modePatient === 'existant' && !patientChoisi) {
      Alert.alert('Patient', 'Sélectionnez un patient existant.')
      return
    }
    if (modePatient === 'nouveau' && !nom.trim()) {
      Alert.alert('Patient', 'Le nom du patient est obligatoire.')
      return
    }
    if (modePatient === 'nouveau' && !profession.trim()) {
      Alert.alert('Patient', 'La profession du patient est obligatoire.')
      return
    }
    if (!serviceId) {
      Alert.alert('Service', 'Choisissez le service à consulter.')
      return
    }
    if (consultationsDuService.length > 1 && !consultationId) {
      Alert.alert('Consultation', 'Choisissez le type de consultation.')
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        cliniqueId,
        serviceId,
        typePatient,
        motif: motif.trim() || undefined,
        referent: typePatient === 'EXTERNE' ? referent || undefined : undefined,
        prestationDemandee: typePatient === 'EXTERNE' ? prestationDemandee || undefined : undefined,
        consultationPrestationId: consultationId ?? undefined,
        actePrestationId: typePatient === 'EXTERNE' ? actePrestationId ?? undefined : undefined,
      }
      if (modePatient === 'existant') {
        payload.patientId = patientChoisi!.id
      } else {
        payload.nouveauPatient = {
          nom: nom.trim(),
          prenom: prenom.trim(),
          age: age || undefined,
          dateNaissance: dateNaissance || undefined,
          numeroCni: cni || undefined,
          numeroCmu: cmu || undefined,
          sexe: sexe || undefined,
          telephone: telephone || undefined,
          ville: ville || undefined,
          quartier: quartier || undefined,
          profession: profession || undefined,
        }
      }
      const { data } = await http.post('/accueil/passages', payload)
      Alert.alert(
        '✅ Passage créé',
        `N° d'ordre : ${data.numeroOrdre}\nPatient : ${data.patient?.nom ?? ''} ${data.patient?.prenom ?? ''}\nCode patient : ${data.patient?.code ?? ''}`,
      )
      await imprimerTicket(data.id, data.numeroOrdre)
      // Réinitialiser
      setNom(''); setPrenom(''); setAge(''); setDateNaissance(''); setCni(''); setCmu(''); setSexe(''); setTelephone('')
      setVille(''); setQuartier(''); setProfession(''); setMotif('')
      setDoublons([])
      setPatientChoisi(null); setRecherchePatient(''); setResultatsPatients([])
      setServiceId(null); setTypePatient('INTERNE'); setReferent(''); setPrestationDemandee('')
      setConsultationId(null); setActePrestationId(null)
      chargerJour(1)
      chargerCompteurs()
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  // ── Assurance du patient (patient existant) ──
  async function ouvrirAssurance() {
    if (!patientChoisi) return
    setAssuranceId(null); setFormuleId(null)
    setNumeroAssure(''); setNumeroCarte(''); setNomAssurePrincipal('')
    setTypeBeneficiaire(null); setDebutCouverture(''); setFinCouverture('')
    setAssuranceVisible(true)
    try {
      const [a, r] = await Promise.all([
        http.get('/assurances', { params: { cliniqueId } }),
        http.get(`/assurances/patients/${patientChoisi.id}`),
      ])
      setAssurances(
        (Array.isArray(a.data) ? a.data : a.data?.data ?? []).map((x: any) => ({
          value: x.id,
          label: x.libelle ?? x.nom ?? '',
          formules: (x.formules ?? []).filter((f: any) => f.actif !== false),
        })),
      )
      setRattachements(Array.isArray(r.data) ? r.data : r.data?.data ?? r.data?.rattachements ?? [])
    } catch {
      setAssurances([])
      setRattachements([])
    }
  }

  async function rechargerRattachements() {
    if (!patientChoisi) return
    try {
      const r = await http.get(`/assurances/patients/${patientChoisi.id}`)
      setRattachements(Array.isArray(r.data) ? r.data : r.data?.data ?? r.data?.rattachements ?? [])
    } catch {
      setRattachements([])
    }
  }

  async function rattacherAssurance() {
    if (!patientChoisi || !assuranceId || !formuleId) {
      Alert.alert('Assurance', 'Choisissez une assurance et une formule.')
      return
    }
    setSavingAssurance(true)
    try {
      await http.post(`/assurances/patients/${patientChoisi.id}`, {
        assuranceId,
        formuleId,
        numeroAssure: numeroAssure.trim() || undefined,
        numeroCarte: numeroCarte.trim() || undefined,
        nomAssurePrincipal: nomAssurePrincipal.trim() || undefined,
        typeBeneficiaire: typeBeneficiaire ?? undefined,
        dateDebut: debutCouverture || undefined,
        dateFin: finCouverture || undefined,
      })
      Alert.alert('✅ Assurance rattachée', 'Le patient est couvert — la caisse appliquera la formule automatiquement.')
      setAssuranceId(null); setFormuleId(null)
      setNumeroAssure(''); setNumeroCarte(''); setNomAssurePrincipal('')
      setTypeBeneficiaire(null); setDebutCouverture(''); setFinCouverture('')
      await rechargerRattachements()
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Rattachement impossible.')
    } finally {
      setSavingAssurance(false)
    }
  }

  async function basculerRattachement(r: any) {
    try {
      await http.delete(`/assurances/patients/rattachements/${r.id}`)
      await rechargerRattachements()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Opération impossible.')
    }
  }

  // ── Modification d'un passage ──
  async function ouvrirModification(p: PassageJour) {
    setModifCible(p)
    setModifForm({
      nom: p.patient?.nom ?? '',
      prenom: p.patient?.prenom ?? '',
      age: p.patient?.age ?? '',
      dateNaissance: p.patient?.dateNaissance
        ? String(p.patient.dateNaissance).slice(0, 10)
        : '',
      numeroCni: p.patient?.numeroCni ?? '',
      numeroCmu: p.patient?.numeroCmu ?? '',
      sexe: p.patient?.sexe ?? '',
      telephone: p.patient?.telephone ?? '',
      ville: p.patient?.ville ?? '',
      quartier: p.patient?.quartier ?? '',
      profession: p.patient?.profession ?? '',
      serviceId: p.serviceId ?? null,
      typePatient: p.typePatient === 'EXTERNE' ? 'EXTERNE' : 'INTERNE',
      motif: p.motif ?? '',
      referent: p.referent ?? '',
      prestationDemandee: p.prestationDemandee ?? '',
    })
    setModifVisible(true)
  }

  async function enregistrerModification() {
    if (!modifCible) return
    setSavingModif(true)
    try {
      await http.patch(`/accueil/passages/${modifCible.id}`, {
        serviceId: modifForm.serviceId ?? undefined,
        typePatient: modifForm.typePatient,
        motif: modifForm.motif.trim() || undefined,
        referent: modifForm.typePatient === 'EXTERNE' ? modifForm.referent.trim() || undefined : undefined,
        prestationDemandee: modifForm.typePatient === 'EXTERNE' ? modifForm.prestationDemandee.trim() || undefined : undefined,
        patient: {
          nom: modifForm.nom.trim() || undefined,
          prenom: modifForm.prenom.trim() || undefined,
          age: modifForm.age || undefined,
          dateNaissance: modifForm.dateNaissance || undefined,
          numeroCni: modifForm.numeroCni || undefined,
          numeroCmu: modifForm.numeroCmu || undefined,
          sexe: modifForm.sexe || undefined,
          telephone: modifForm.telephone || undefined,
          ville: modifForm.ville || undefined,
          quartier: modifForm.quartier || undefined,
          profession: modifForm.profession || undefined,
        },
      })
      Alert.alert('✅ Passage modifié')
      setModifVisible(false)
      chargerJour(page)
      chargerCompteurs()
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Modification impossible.')
    } finally {
      setSavingModif(false)
    }
  }

  // ── Bloc constantes (utilisé par l'onglet et par le poste CONSTANTE) ──
  const blocConstantes = (
    <Card>
      <SectionTitle>Constantes du jour</SectionTitle>
      <View style={styles.chips}>
        <TouchableOpacity
          style={[styles.chip, filtreConstantes === 'NON' && styles.chipActif]}
          onPress={() => {
            setFiltreConstantes('NON')
            chargerConstantes()
          }}
        >
          <Text style={[styles.chipTexte, filtreConstantes === 'NON' && styles.chipTexteActif]}>
            En attente
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, filtreConstantes === 'OUI' && styles.chipActif]}
          onPress={() => {
            setFiltreConstantes('OUI')
            chargerConstantes()
          }}
        >
          <Text style={[styles.chipTexte, filtreConstantes === 'OUI' && styles.chipTexteActif]}>
            Terminées
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={passagesConstantes}
        keyExtractor={(p) => String(p.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.passageItem} onPress={() => ouvrirConstantes(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.passageNumero}>{item.numeroOrdre}</Text>
              <Text style={styles.passagePatient}>
                {item.patient.nom} {item.patient.prenom}
              </Text>
              <Text style={styles.constantesResume}>
                {item.temperature != null ? `T° ${item.temperature} · ` : ''}
                {item.tensionGauche ? `TA ${item.tensionGauche} · ` : ''}
                {item.pouls != null ? `Pouls ${item.pouls}` : ''}
                {item.temperature == null && !item.tensionGauche && item.pouls == null ? 'Aucune constante saisie' : ''}
              </Text>
            </View>
            <Btn
              title={filtreConstantes === 'NON' ? '📝 Saisir' : '✏️ Modifier'}
              small
              variant="outline"
              onPress={() => ouvrirConstantes(item)}
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.vide}>
            {chargementConstantes
              ? 'Chargement…'
              : filtreConstantes === 'NON'
                ? 'Aucun patient en attente de constantes.'
                : 'Aucune constante terminée.'}
          </Text>
        }
      />
    </Card>
  )

  // ── Rendu ──
  return (
    <Screen>
      <View style={styles.bandeau}>
        <TouchableOpacity
          style={styles.btnRetour}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <View style={styles.bandeauTitre}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.titre}>🏥 Accueil</Text>
            <Text style={styles.sousTitre} numberOfLines={1} ellipsizeMode="tail">
              {user?.clinique?.nom ?? "Gestion Clinique"}
            </Text>
          </View>

          {peutBasculer ? (
            <TouchableOpacity
              style={styles.btnBasculer}
              onPress={basculerPoste}
            >
              <Text style={styles.btnBasculerTexte} numberOfLines={1}>
                ⚡ {posteConstante ? "Enregistrement" : "Constante"}
              </Text>
            </TouchableOpacity>
          ) : null}
         
        </View>
      </View>

      {/* Onglets (masqués sur le poste CONSTANTE) */}
      {!posteConstante ? (
        <View style={styles.onglets}>
          {(["nouveau", "jour", "constantes"] as const).map((o) => (
            <TouchableOpacity
              key={o}
              style={[styles.onglet, onglet === o && styles.ongletActif]}
              onPress={() => {
                setOnglet(o);
                if (o === "constantes") chargerConstantes();
                if (o === "jour") chargerJour(1);
              }}
            >
              <Text
                style={[
                  styles.ongletTexte,
                  onglet === o && styles.ongletTexteActif,
                ]}
              >
                {o === "nouveau"
                  ? "Nouveau passage"
                  : o === "jour"
                    ? "Passages du jour"
                    : "Constantes"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {posteConstante ? (
        blocConstantes
      ) : onglet === "nouveau" ? (
        <>
          <Card>
            <SectionTitle>Patient</SectionTitle>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  modePatient === "nouveau" && styles.chipActif,
                ]}
                onPress={() => setModePatient("nouveau")}
              >
                <Text
                  style={[
                    styles.chipTexte,
                    modePatient === "nouveau" && styles.chipTexteActif,
                  ]}
                >
                  Nouveau patient
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  modePatient === "existant" && styles.chipActif,
                ]}
                onPress={() => setModePatient("existant")}
              >
                <Text
                  style={[
                    styles.chipTexte,
                    modePatient === "existant" && styles.chipTexteActif,
                  ]}
                >
                  Patient existant
                </Text>
              </TouchableOpacity>
            </View>

            {modePatient === "existant" ? (
              <>
                <Input
                  label="Rechercher (nom, code, téléphone, CNI, CMU, date de naissance)"
                  value={recherchePatient}
                  onChangeText={setRecherchePatient}
                  placeholder="Ex : TRAORE, 0700000000, 12/05/1990"
                />
                {resultatsPatients.map((pt) => (
                  <TouchableOpacity
                    key={pt.id}
                    style={styles.patientItem}
                    onPress={() => setPatientChoisi(pt)}
                  >
                    <Text style={styles.patientItemTexte}>
                      {pt.nom} {pt.prenom} · {pt.code}
                      {pt.age ? ` · ${pt.age} ans` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
                {patientChoisi ? (
                  <View style={styles.patientChoisi}>
                    <Text style={styles.patientChoisiTexte}>
                      ✅ {patientChoisi.nom} {patientChoisi.prenom} (
                      {patientChoisi.code})
                    </Text>
                    <Btn
                      title="🛡️ Assurance du patient"
                      small
                      variant="outline"
                      onPress={ouvrirAssurance}
                    />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.ligne}>
                  <View style={styles.ligneItem}>
                    <Input label="N° CNI" value={cni} onChangeText={changerCni} />
                  </View>
                  <View style={styles.ligneItem}>
                    <Input label="N° CMU" value={cmu} onChangeText={changerCmu} />
                  </View>
                </View>
                <Input label="Nom *" value={nom} onChangeText={setNom} />
                {doublons.length > 0 ? (
                  <View style={styles.doublons}>
                    <Text style={styles.doublonsTitre}>
                      ⚠️ {doublons.length} patient(s) ressemblant(s) trouvé(s) :
                    </Text>
                    {doublons.map((d) => (
                      <View key={d.id} style={styles.doublonItem}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.doublonNom} numberOfLines={1} ellipsizeMode="tail">
                            {d.nom} {d.prenom} · code {d.code}
                          </Text>
                          <Text style={styles.doublonSous} numberOfLines={1} ellipsizeMode="tail">
                            Dossier {d.numeroDossier}
                            {d.passages?.[0] ? ` · ${d.passages[0].numeroOrdre}` : ""}
                          </Text>
                        </View>
                        <Btn
                          title="Utiliser"
                          small
                          variant="outline"
                          onPress={() => utiliserPatientExistant(d)}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}
                <Input
                  label="Prénoms"
                  value={prenom}
                  onChangeText={setPrenom}
                />
                <View style={styles.ligne}>
                  <View style={styles.ligneItem}>
                    <Input
                      label="Âge"
                      value={age}
                      onChangeText={changerAge}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.ligneItem}>
                    <Input label="Sexe">
                      <ListeSelect
                        value={sexe}
                        options={[
                          { value: "M", label: "Masculin" },
                          { value: "F", label: "Féminin" },
                        ]}
                        placeholder="— Choisir —"
                        onChange={(v) => setSexe(v as string)}
                      />
                    </Input>
                  </View>
                </View>
                <DateField
                  label="Date de naissance"
                  value={dateNaissance}
                  onChange={changerDateNaissance}
                />
                <Input
                  label="Téléphone"
                  value={telephone}
                  onChangeText={setTelephone}
                  keyboardType="phone-pad"
                />
                <ListeCombo
                  label="Ville (résidence)"
                  value={ville}
                  options={listes.residence}
                  placeholder="— Choisir une ville —"
                  onChange={setVille}
                  ajouter={(v) => ajouterListe('residence', v)}
                />
                <View style={styles.ligne}>
                  <View style={styles.ligneItem}>
                    <ListeCombo
                      label="Quartier"
                      value={quartier}
                      options={listes.quartier}
                      placeholder="— Choisir —"
                      onChange={setQuartier}
                      ajouter={(v) => ajouterListe('quartier', v)}
                    />
                  </View>
                  <View style={styles.ligneItem}>
                    <ListeCombo
                      label="Profession *"
                      value={profession}
                      options={listes.profession}
                      placeholder="— Choisir —"
                      onChange={setProfession}
                      ajouter={(v) => ajouterListe('profession', v)}
                    />
                  </View>
                </View>
              </>
            )}
          </Card>

          <Card>
            <SectionTitle>Passage</SectionTitle>
            <Input label="Service à consulter *">
              <ListeSelect
                value={serviceId}
                options={services.map((s) => ({ value: s.id, label: s.nom }))}
                placeholder="— Choisir un service —"
                onChange={(v) => setServiceId(v as number)}
              />
            </Input>
            {consultationsDuService.length > 1 ? (
              <Input label="Type de consultation *">
                <ListeSelect
                  value={consultationId}
                  options={consultationsDuService.map((p) => ({
                    value: p.id,
                    label: p.libelle,
                  }))}
                  placeholder="— Choisir —"
                  onChange={(v) => setConsultationId(v as number)}
                />
              </Input>
            ) : null}
            <Input label="Type de patient">
              <ListeSelect
                value={typePatient}
                options={[
                  { value: "INTERNE", label: "Patient interne" },
                  { value: "EXTERNE", label: "Patient externe" },
                ]}
                onChange={(v) => setTypePatient(v as "INTERNE" | "EXTERNE")}
              />
            </Input>
            <ListeCombo
              label="Motif de consultation"
              value={motif}
              options={listes.motif}
              placeholder="— Choisir un motif —"
              onChange={setMotif}
              ajouter={(v) => ajouterListe('motif', v)}
            />
            {typePatient === "EXTERNE" ? (
              <>
                <Input
                  label="Structure / professionnel référent"
                  value={referent}
                  onChangeText={setReferent}
                  placeholder="Ex : CS de Yopougon, Dr Kouamé"
                />
                {actesDuService.length > 0 ? (
                  <Input label="Acte à payer (l'examen prescrit)">
                    <ListeSelect
                      value={actePrestationId}
                      options={actesDuService.map((p) => ({
                        value: p.id,
                        label: p.libelle,
                      }))}
                      placeholder="— Choisir l'examen de l'ordonnance —"
                      onChange={(v) => setActePrestationId(v as number)}
                    />
                  </Input>
                ) : null}
                <Input
                  label="Précision sur la prestation (facultatif)"
                  value={prestationDemandee}
                  onChangeText={setPrestationDemandee}
                  placeholder="Ex : contrôle, suivi…"
                />
              </>
            ) : null}
            <Btn
              title="Enregistrer le passage"
              onPress={enregistrerPassage}
              loading={saving}
            />
          </Card>

          {ticket ? <ApercuTexte contenu={ticket} /> : null}
        </>
      ) : onglet === "jour" ? (
        <Card>
          <SectionTitle>Passages du jour ({compteurs.jour})</SectionTitle>
          <View style={styles.barreRecherche}>
            <TextInput
              style={styles.rechercheJour}
              placeholder="Rechercher…"
              value={rechercheJour}
              onChangeText={setRechercheJour}
            />
          </View>
          <Input label="Service">
            <ListeSelect
              value={filtreServiceJour}
              options={services.map((s) => ({ value: s.id, label: s.nom }))}
              placeholder="Tous les services"
              onChange={(v) => setFiltreServiceJour(v as number | null)}
            />
          </Input>
          <View style={styles.ligne}>
            <View style={styles.ligneItem}>
              <Input
                label="Du"
                value={filtreDebut}
                onChangeText={setFiltreDebut}
                placeholder="AAAA-MM-JJ"
              />
            </View>
            <View style={styles.ligneItem}>
              <Input
                label="Au"
                value={filtreFin}
                onChangeText={setFiltreFin}
                placeholder="AAAA-MM-JJ"
              />
            </View>
          </View>
          <FlatList
            data={passages}
            keyExtractor={(p) => String(p.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.passageItem}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.passageNumero}>{item.numeroOrdre}</Text>
                  <Text style={styles.passagePatient} numberOfLines={1} ellipsizeMode="tail">
                    {item.patient.nom} {item.patient.prenom}
                  </Text>
                  <View style={styles.passageStatut}>
                    <Badge
                      label={item.statut}
                      tone={item.statut === "ACTIF" ? "success" : "warning"}
                    />
                  </View>
                </View>
                <View style={styles.passageActions}>
                  <Btn
                    title="✏️ Modifier"
                    small
                    variant="outline"
                    onPress={() => ouvrirModification(item)}
                  />
                  <Btn
                    title="🖨️ Ticket"
                    small
                    variant="outline"
                    onPress={() => imprimerTicket(item.id, item.numeroOrdre)}
                  />
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.vide}>
                {chargementListe ? "Chargement…" : "Aucun passage ce jour."}
              </Text>
            }
          />
          <PaginationBar
            page={page}
            totalPages={totalPagesJour}
            onPage={(p) => chargerJour(p)}
          />
        </Card>
      ) : (
        blocConstantes
      )}

      {/* Modale : saisie des constantes */}
      <Modal
        visible={constanteCible !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setConstanteCible(null)}
      >
        <View style={styles.modalVoile}>
          <View style={styles.modalCarte}>
            <Text style={styles.modalTitre}>
              ✍️ Constantes — {constanteCible?.patient.nom}{" "}
              {constanteCible?.patient.prenom}
            </Text>
            <Text style={styles.modalSousTitre}>
              {constanteCible?.numeroOrdre}
            </Text>
            <ScrollView style={styles.modalScroll}>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input
                    label="Taille (cm)"
                    value={formConst.taille}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, taille: t })
                    }
                  />
                </View>
                <View style={styles.ligneItem}>
                  <Input
                    label="Température (°C)"
                    value={formConst.temperature}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, temperature: t })
                    }
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input
                    label="Pouls (bpm)"
                    value={formConst.pouls}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, pouls: t })
                    }
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.ligneItem}>
                  <Input
                    label="Poids (kg)"
                    value={formConst.poids}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, poids: t })
                    }
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input
                    label="Périm. brachial (cm)"
                    value={formConst.perimetreBrachial}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, perimetreBrachial: t })
                    }
                  />
                </View>
                <View style={styles.ligneItem}>
                  <Input
                    label="Périm. crânien (cm)"
                    value={formConst.perimetreCranien}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, perimetreCranien: t })
                    }
                  />
                </View>
              </View>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input
                    label="TA gauche (ex : 12/8)"
                    value={formConst.tensionGauche}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, tensionGauche: t })
                    }
                  />
                </View>
                <View style={styles.ligneItem}>
                  <Input
                    label="TA droite (ex : 12/8)"
                    value={formConst.tensionDroite}
                    onChangeText={(t) =>
                      setFormConst({ ...formConst, tensionDroite: t })
                    }
                  />
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Btn
                title="Annuler"
                variant="outline"
                onPress={() => setConstanteCible(null)}
              />
              <Btn
                title="💾 Enregistrer"
                onPress={enregistrerConstantes}
                loading={savingConst}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modale : assurance du patient */}
      <Modale
        visible={assuranceVisible}
        titre="🛡️ Assurance du patient"
        sousTitre={
          patientChoisi
            ? `${patientChoisi.nom} ${patientChoisi.prenom} (${patientChoisi.code})`
            : undefined
        }
        onFermer={() => setAssuranceVisible(false)}
      >
        <Input label="Assurance *" required>
          <ListeSelect
            value={assuranceId}
            options={assurances.map((a) => ({
              value: a.value,
              label: a.label,
            }))}
            placeholder="— Choisir une assurance —"
            onChange={(v) => {
              setAssuranceId(v as number);
              setFormuleId(null);
            }}
          />
        </Input>
        <Input label="Formule *" required>
          <ListeSelect
            value={formuleId}
            options={(
              assurances.find((a) => a.value === assuranceId)?.formules ?? []
            ).map((f) => ({
              value: f.id,
              label: f.libelle,
            }))}
            placeholder="— Choisir une formule —"
            onChange={(v) => setFormuleId(v as number)}
            disabled={!assuranceId}
          />
        </Input>
        <Input
          label="N° d'assuré"
          value={numeroAssure}
          onChangeText={setNumeroAssure}
        />
        <Input
          label="N° de carte"
          value={numeroCarte}
          onChangeText={setNumeroCarte}
        />
        <Input
          label="Assuré principal"
          value={nomAssurePrincipal}
          onChangeText={setNomAssurePrincipal}
        />
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.modalLabel}>Type de bénéficiaire</Text>
          <View style={styles.chips}>
            {["ASSURE", "CONJOINT", "ENFANT", "AUTRE"].map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.chip,
                  typeBeneficiaire === t && styles.chipActif,
                ]}
                onPress={() =>
                  setTypeBeneficiaire(typeBeneficiaire === t ? null : t)
                }
              >
                <Text
                  style={[
                    styles.chipTexte,
                    typeBeneficiaire === t && styles.chipTexteActif,
                  ]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.ligne}>
          <View style={styles.ligneItem}>
            <Input
              label="Début de couverture"
              value={debutCouverture}
              onChangeText={setDebutCouverture}
              placeholder="AAAA-MM-JJ"
            />
          </View>
          <View style={styles.ligneItem}>
            <Input
              label="Fin de couverture"
              value={finCouverture}
              onChangeText={setFinCouverture}
              placeholder="AAAA-MM-JJ"
            />
          </View>
        </View>

        <SectionTitle>Rattachements existants</SectionTitle>
        {rattachements.length === 0 ? (
          <Text style={styles.vide}>Aucun rattachement.</Text>
        ) : (
          rattachements.map((r) => (
            <View key={r.id} style={styles.rattachementItem}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.passagePatient} numberOfLines={1} ellipsizeMode="tail">
                  {r.assurance?.libelle ?? r.assurance?.nom ?? "Assurance"} —{" "}
                  {r.formule?.libelle ?? ""}
                  {r.numeroAssure ? ` · N° ${r.numeroAssure}` : ""}
                </Text>
                <View style={styles.passageStatut}>
                  <Badge
                    label={r.statut === "ACTIF" ? "Actif" : "Inactif"}
                    tone={r.statut === "ACTIF" ? "success" : "muted"}
                  />
                </View>
              </View>
              <Btn
                title={r.statut === "ACTIF" ? "Désactiver" : "Réactiver"}
                small
                variant={r.statut === "ACTIF" ? "danger" : "outline"}
                onPress={() => basculerRattachement(r)}
              />
            </View>
          ))
        )}

        <View style={styles.modalActions}>
          <Btn
            title="Fermer"
            variant="outline"
            onPress={() => setAssuranceVisible(false)}
          />
          <Btn
            title="💾 Rattacher"
            onPress={rattacherAssurance}
            loading={savingAssurance}
          />
        </View>
      </Modale>

      {/* Modale : modification d'un passage */}
      <Modale
        visible={modifVisible}
        titre="✏️ Modifier le passage"
        sousTitre={modifCible?.numeroOrdre}
        onFermer={() => setModifVisible(false)}
        actions={
          <>
            <Btn
              title="Fermer"
              variant="outline"
              onPress={() => setModifVisible(false)}
            />
            <Btn
              title="💾 Enregistrer"
              onPress={enregistrerModification}
              loading={savingModif}
            />
          </>
        }
      >
        <SectionTitle>Patient</SectionTitle>
        <View style={styles.ligne}>
          <View style={styles.ligneItem}>
            <Input
              label="N° CNI"
              value={modifForm.numeroCni}
              onChangeText={(t) => setModifForm({ ...modifForm, numeroCni: t })}
            />
          </View>
          <View style={styles.ligneItem}>
            <Input
              label="N° CMU"
              value={modifForm.numeroCmu}
              onChangeText={(t) => setModifForm({ ...modifForm, numeroCmu: t })}
            />
          </View>
        </View>
        <View style={styles.ligne}>
          <View style={styles.ligneItem}>
            <Input
              label="Nom"
              value={modifForm.nom}
              onChangeText={(t) => setModifForm({ ...modifForm, nom: t })}
            />
          </View>
          <View style={styles.ligneItem}>
            <Input
              label="Prénoms"
              value={modifForm.prenom}
              onChangeText={(t) => setModifForm({ ...modifForm, prenom: t })}
            />
          </View>
        </View>
        <View style={styles.ligne}>
          <View style={styles.ligneItem}>
            <Input
              label="Âge"
              value={modifForm.age}
              onChangeText={(t) => {
                setModifForm({ ...modifForm, age: t })
                if (t && !modifForm.dateNaissance) {
                  setModifForm({ ...modifForm, age: t, dateNaissance: naissanceDepuisAge(t) })
                }
              }}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.ligneItem}>
            <Input label="Sexe">
              <ListeSelect
                value={modifForm.sexe}
                options={[
                  { value: "M", label: "Masculin" },
                  { value: "F", label: "Féminin" },
                ]}
                placeholder="— Choisir —"
                onChange={(v) => setModifForm({ ...modifForm, sexe: v as string })}
              />
            </Input>
          </View>
        </View>
        <DateField
          label="Date de naissance"
          value={modifForm.dateNaissance}
          onChange={(t) => {
            const a = ageDepuisNaissance(t)
            setModifForm({ ...modifForm, dateNaissance: t, ...(a ? { age: a } : {}) })
          }}
        />
        <View style={styles.ligne}>
          <View style={styles.ligneItem}>
            <Input
              label="Téléphone"
              value={modifForm.telephone}
              onChangeText={(t) => setModifForm({ ...modifForm, telephone: t })}
              keyboardType="phone-pad"
            />
          </View>
          <View style={styles.ligneItem}>
            <ListeCombo
              label="Ville (résidence)"
              value={modifForm.ville}
              options={listes.residence}
              placeholder="— Choisir —"
              onChange={(v) => setModifForm({ ...modifForm, ville: v })}
              ajouter={(v) => ajouterListe('residence', v)}
            />
          </View>
        </View>
        <View style={styles.ligne}>
          <View style={styles.ligneItem}>
            <ListeCombo
              label="Quartier"
              value={modifForm.quartier}
              options={listes.quartier}
              placeholder="— Choisir —"
              onChange={(v) => setModifForm({ ...modifForm, quartier: v })}
              ajouter={(v) => ajouterListe('quartier', v)}
            />
          </View>
          <View style={styles.ligneItem}>
            <ListeCombo
              label="Profession *"
              value={modifForm.profession}
              options={listes.profession}
              placeholder="— Choisir —"
              onChange={(v) => setModifForm({ ...modifForm, profession: v })}
              ajouter={(v) => ajouterListe('profession', v)}
            />
          </View>
        </View>
        <SectionTitle>Passage</SectionTitle>
        <Input label="Service">
          <ListeSelect
            value={modifForm.serviceId}
            options={services.map((s) => ({ value: s.id, label: s.nom }))}
            placeholder="— Choisir un service —"
            onChange={(v) =>
              setModifForm({ ...modifForm, serviceId: v as number | null })
            }
          />
        </Input>
        <Input label="Type de patient">
          <ListeSelect
            value={modifForm.typePatient}
            options={[
              { value: "INTERNE", label: "Patient interne" },
              { value: "EXTERNE", label: "Patient externe" },
            ]}
            onChange={(v) =>
              setModifForm({
                ...modifForm,
                typePatient: v as "INTERNE" | "EXTERNE",
              })
            }
          />
        </Input>
        {modifForm.typePatient === "EXTERNE" ? (
          <>
            <Input
              label="Structure / professionnel référent"
              value={modifForm.referent}
              onChangeText={(t) => setModifForm({ ...modifForm, referent: t })}
            />
            <Input
              label="Précision sur la prestation"
              value={modifForm.prestationDemandee}
              onChangeText={(t) =>
                setModifForm({ ...modifForm, prestationDemandee: t })
              }
            />
          </>
        ) : null}
        <ListeCombo
          label="Motif"
          value={modifForm.motif}
          options={listes.motif}
          placeholder="— Choisir un motif —"
          onChange={(v) => setModifForm({ ...modifForm, motif: v })}
          ajouter={(v) => ajouterListe('motif', v)}
        />
      </Modale>
    </Screen>
  );
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
  bandeauTitre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnBasculer: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnBasculerTexte: { color: '#92400e', fontWeight: '800', fontSize: 12.5 },
  titre: { fontSize: 22, fontWeight: '800', color: colors.primaryDarker, marginTop: 4 },
  sousTitre: { color: colors.textMuted, fontSize: 13 },
  onglets: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
  },
  onglet: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  ongletActif: { backgroundColor: colors.primary },
  ongletTexte: { fontWeight: '700', color: colors.textMuted, fontSize: 13.5 },
  ongletTexteActif: { color: '#fff' },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: {
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipActif: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTexte: { fontWeight: '700', fontSize: 13, color: colors.textMuted },
  chipTexteActif: { color: '#fff' },
  patientItem: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  patientItemTexte: { fontSize: 14, color: colors.text },
  patientChoisi: {
    backgroundColor: colors.successBg,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  patientChoisiTexte: { color: '#166534', fontWeight: '700' },
  ligne: { flexDirection: 'row', gap: 10 },
  ligneItem: { flex: 1 },
  barreRecherche: { marginBottom: 10 },
  rechercheJour: {
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  modalLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
  rattachementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  passageStatut: { marginTop: 5, alignSelf: 'flex-start' },
  passageActions: {
    flexDirection: 'column',
    gap: 6,
    alignItems: 'stretch',
    flexShrink: 0,
  },
  passageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  passageNumero: { fontWeight: '800', color: colors.primaryDarker, fontSize: 14 },
  passagePatient: { color: colors.text, fontSize: 13.5, marginBottom: 4 },
  constantesResume: { fontSize: 12, color: colors.textMuted },
  doublons: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 10,
  },
  doublonsTitre: { fontSize: 12.5, fontWeight: '800', color: '#92400e', marginBottom: 6 },
  doublonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    borderTopColor: '#fde68a',
    borderTopWidth: 1,
  },
  doublonNom: { fontSize: 13.5, fontWeight: '700', color: '#78350f' },
  doublonSous: { fontSize: 12, color: '#a16207' },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 20 },
  modalVoile: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalCarte: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    maxHeight: '90%',
  },
  modalTitre: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker },
  modalSousTitre: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  modalScroll: { flexGrow: 0 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
  },
})
