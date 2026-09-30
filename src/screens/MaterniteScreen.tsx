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
  InfoLigne,
  Input,
  Modale,
  Onglets,
  PaginationBar,
  Screen,
  SectionTitle,
  EtatVide,
} from '../components/ui'
import ListeCombo from '../components/ListeCombo'
import ListeSelect from '../components/ListeSelect'
import DateField from '../components/DateField'

const METHODES_PF = [
  'Pilule (COC)', 'Pilule (COP)', 'Injectable IM 3 mois', 'Injectable IM 2 mois',
  'Injectable sous cutané 3 mois', 'Auto-injection 3 mois', 'DIU', 'DIU-PP',
  'Implant 5 ans', 'Implant 3 ans', 'Condom masculin', 'Condom féminin',
  'Spermicide', 'Contraception d’urgence',
]

const OUI_NON = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
]

/** Champ Oui/Non réutilisable (true/false/null). */
function champBooleen(valeur: any): string {
  if (valeur === true) return 'true'
  if (valeur === false) return 'false'
  return ''
}

export default function MaterniteScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1

  // ── Accueil du module ──
  const [onglet, setOnglet] = useState<'attente' | 'termines'>('attente')
  const [file, setFile] = useState<any[]>([])
  const [traites, setTraites] = useState<any>({ data: [], total: 0, page: 1, perPage: 10, totalPages: 1 })
  const [jourTraites, setJourTraites] = useState('')
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<any[]>([])

  // ── Traitement ──
  const [passage, setPassage] = useState<any | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [dossier, setDossier] = useState<any>(null)
  const [cpons, setCpons] = useState<any[]>([])
  const [pfs, setPfs] = useState<any[]>([])
  const [ongletT, setOngletT] = useState<'cpn' | 'cpon' | 'accouchement' | 'pf' | 'ordonnance' | 'examens'>('cpn')
  const [saving, setSaving] = useState(false)

  // Listes
  const [listes, setListes] = useState<Record<string, { value: string; label: string }[]>>({})
  const [medicaments, setMedicaments] = useState<any[]>([])
  const [posologies, setPosologies] = useState<any[]>([])
  const [prestations, setPrestations] = useState<any[]>([])

  // ── CPN ──
  const [formCpn, setFormCpn] = useState<any>({})
  const [visiteEnEdition, setVisiteEnEdition] = useState<any>(null)

  // ── CPoN ──
  const [formCpon, setFormCpon] = useState<any>({})
  const [cponEnEdition, setCponEnEdition] = useState<any>(null)

  // ── Accouchement ──
  const [formAcc, setFormAcc] = useState<any>({})

  // ── PF ──
  const [formPf, setFormPf] = useState<any>({})
  const [pfEnEdition, setPfEnEdition] = useState<any>(null)

  // ── Ordonnance / Examens ──
  const [modaleMed, setModaleMed] = useState(false)
  const [medId, setMedId] = useState<number | null>(null)
  const [medNom, setMedNom] = useState('')
  const [medPoso, setMedPoso] = useState('')
  const [medQte, setMedQte] = useState('')
  const [medDuree, setMedDuree] = useState('')
  const [examenId, setExamenId] = useState<number | null>(null)
  const [examenLibre, setExamenLibre] = useState('')

  // ───────────────────────── Chargements ─────────────────────────

  async function chargerFile() {
    try {
      const { data } = await http.get('/maternite/file', { params: { cliniqueId } })
      setFile(data ?? [])
    } catch {
      setFile([])
    }
  }

  async function chargerTraites(p = 1) {
    try {
      const { data } = await http.get('/maternite/traites', {
        params: { cliniqueId, jour: jourTraites || undefined, page: p, perPage: 10 },
      })
      setTraites(data)
    } catch {
      setTraites({ data: [], total: 0, page: 1, perPage: 10, totalPages: 1 })
    }
  }

  useEffect(() => {
    chargerFile()
    chargerTraites()
    ;(async () => {
      try {
        const [p, r, q, m, med, pos, prest] = await Promise.all([
          http.get('/professions', { params: { cliniqueId } }),
          http.get('/residences', { params: { cliniqueId } }),
          http.get('/quartiers', { params: { cliniqueId } }),
          http.get('/motifs', { params: { cliniqueId } }),
          http.get('/medicaments', { params: { cliniqueId } }),
          http.get('/posologies', { params: { cliniqueId } }),
          http.get('/prestations', { params: { perPage: 0, cliniqueId } }),
        ])
        const opts = (d: any[]) => (d ?? []).map((x) => ({ value: x.libelle, label: x.libelle }))
        setListes({
          profession: opts(p.data),
          residence: opts(r.data),
          quartier: opts(q.data),
          motif: opts(m.data),
        })
        setMedicaments((med.data ?? []).filter((x: any) => x.actif))
        setPosologies(pos.data ?? [])
        const prests = Array.isArray(prest.data) ? prest.data : prest.data.data ?? []
        setPrestations(prests)
      } catch {
        /* listes vides */
      }
    })()
  }, [])

  // Recherche (debounce)
  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/maternite/recherche', { params: { code: q, cliniqueId } })
        setResultats(data ?? [])
      } catch {
        setResultats([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [recherche])

  // ───────────────────────── Traitement ─────────────────────────

  async function ouvrirTraitement(p: any) {
    setPassage(p)
    setOngletT('cpn')
    setRecherche('')
    setResultats([])
    await chargerDetail(p.id)
  }

  async function chargerDetail(passageId?: number) {
    const id = passageId ?? passage?.id
    if (!id) return
    try {
      const { data } = await http.get(`/maternite/passages/${id}`)
      setDetail(data)
      setDossier(data.dossier)
      setCpons(data.cpons ?? [])
      setPfs(data.pfs ?? [])
      initFormCpn(data)
      initFormCpon(data)
      initFormAcc(data)
      initFormPf()
    } catch (e: any) {
      Alert.alert('Maternité', e.response?.data?.message ?? 'Impossible de charger le passage.')
    }
  }

  function quitter() {
    setPassage(null)
    setDetail(null)
    setDossier(null)
    chargerFile()
    chargerTraites()
  }

  // ───────────────────────── Accouchement en urgence ─────────────────────────
  // La patiente arrive en travail : passage créé sans paiement (la caisse
  // encaisse après l'accouchement) + dossier grossesse créé à la volée.
  const [urgenceVisible, setUrgenceVisible] = useState(false)
  const [urgenceRecherche, setUrgenceRecherche] = useState('')
  const [urgenceResultats, setUrgenceResultats] = useState<any[]>([])
  const [urgencePatiente, setUrgencePatiente] = useState<any>(null)
  const [urgenceForm, setUrgenceForm] = useState({ nom: '', prenom: '', age: '', telephone: '' })
  const [urgenceEnCours, setUrgenceEnCours] = useState(false)

  useEffect(() => {
    const q = urgenceRecherche.trim()
    if (!urgencePatiente && q.length >= 2) {
      const t = setTimeout(async () => {
        try {
          const { data } = await http.get('/maternite/urgences/patients', { params: { recherche: q, cliniqueId } })
          setUrgenceResultats(data ?? [])
        } catch {
          setUrgenceResultats([])
        }
      }, 300)
      return () => clearTimeout(t)
    }
    setUrgenceResultats([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgenceRecherche, urgencePatiente])

  function ouvrirUrgence() {
    setUrgenceVisible(true)
    setUrgenceRecherche('')
    setUrgenceResultats([])
    setUrgencePatiente(null)
    setUrgenceForm({ nom: '', prenom: '', age: '', telephone: '' })
  }

  async function creerUrgence() {
    if (!urgencePatiente && (!urgenceForm.nom.trim() || !urgenceForm.prenom.trim())) {
      Alert.alert('Urgence', 'Sélectionnez une patiente existante ou saisissez nom et prénoms.')
      return
    }
    setUrgenceEnCours(true)
    try {
      const corps: any = { cliniqueId }
      if (urgencePatiente) {
        corps.patientId = urgencePatiente.id
      } else {
        corps.nouveauPatient = {
          nom: urgenceForm.nom.trim(),
          prenom: urgenceForm.prenom.trim(),
          age: urgenceForm.age.trim() || undefined,
          sexe: 'F',
          telephone: urgenceForm.telephone.trim() || undefined,
        }
      }
      const { data } = await http.post('/maternite/urgences', corps)
      Alert.alert('✅ Passage créé', `${data.passage.numeroOrdre} — le paiement se fera à la caisse après l'accouchement.`)
      setUrgenceVisible(false)
      setPassage(data.passage)
      setOngletT('accouchement')
      setRecherche('')
      setResultats([])
      await chargerDetail(data.passage.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Impossible de créer le passage en urgence.')
    } finally {
      setUrgenceEnCours(false)
    }
  }

  async function terminer() {
    try {
      await http.patch(`/maternite/passages/${passage.id}/terminer`)
      Alert.alert('✅ Prise en charge terminée', 'La patiente passe dans « terminés ».')
      quitter()
      setOnglet('termines')
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Impossible de terminer.')
    }
  }

  function payloadNettoye(form: any) {
    const copie: any = {}
    for (const [k, v] of Object.entries(form)) {
      if (k === 'id') continue
      copie[k] = v === '' ? null : v
    }
    return copie
  }

  // ───────────────────────── CPN ─────────────────────────

  function initFormCpn(d?: any) {
    const g = (d ?? detail)?.dossier
    const pat = (d ?? detail)?.passage?.patient
    // Constantes saisies à l'accueil : préremplissent l'examen clinique
    const cst = (d ?? detail)?.passage
    const v = visiteEnEdition
    setFormCpn({
      date: v?.date ? v.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      modeEntree: g?.modeEntree ?? '',
      numeroGestante: g?.numeroGestante ?? '',
      nom: pat?.nom ?? '',
      prenom: pat?.prenom ?? '',
      age: pat?.age != null ? String(pat.age) : '',
      profession: pat?.profession ?? '',
      nationalite: pat?.nationalite ?? '',
      statutConjugal: pat?.statutConjugal ?? '',
      scolarisation: pat?.scolarisation ?? '',
      residenceHabituelle: pat?.residenceHabituelle ?? '',
      residenceActuelle: pat?.residenceActuelle ?? '',
      telephone: pat?.telephone ?? '',
      gravidite: g?.gravidite != null ? String(g.gravidite) : '',
      parite: g?.parite != null ? String(g.parite) : '',
      enfantsVivants: g?.enfantsVivants != null ? String(g.enfantsVivants) : '',
      enfantsDecedes: g?.enfantsDecedes != null ? String(g.enfantsDecedes) : '',
      cesariennes: g?.cesariennes != null ? String(g.cesariennes) : '',
      avortements: g?.avortements != null ? String(g.avortements) : '',
      toxemie: g?.toxemie ?? '',
      antecedentsMedicaux: g?.antecedentsMedicaux ?? '',
      antecedentsChirurgicaux: g?.antecedentsChirurgicaux ?? '',
      antecedentsObstetricaux: g?.antecedentsObstetricaux ?? '',
      ddr: g?.ddr ? g.ddr.slice(0, 10) : '',
      ageGestationnelSA: v?.ageGestationnelSA ?? '',
      dateDerniereCpn: g?.dateDerniereCpn
        ? g.dateDerniereCpn.slice(0, 10)
        : g?.visites?.length
          ? g.visites[g.visites.length - 1].date.slice(0, 10)
          : '',
      // Rang de la visite (liste CPN1..CPN8)
      numero: v?.numero ?? (g?.visites?.length ?? 0) + 1,
      vatStatut: g?.vatStatut ?? '',
      vat1: g?.vat1 ? g.vat1.slice(0, 10) : '',
      vat2: g?.vat2 ? g.vat2.slice(0, 10) : '',
      vatRappel: g?.vatRappel ? g.vatRappel.slice(0, 10) : '',
      statutVih: g?.statutVih ?? '',
      poids: v?.poids != null ? String(v.poids) : cst?.poids != null ? String(cst.poids) : '',
      taille: v?.taille ?? cst?.taille ?? '',
      tensionGauche: v?.tensionGauche ?? cst?.tensionGauche ?? '',
      tensionDroite: v?.tensionDroite ?? cst?.tensionDroite ?? '',
      oedemes: v?.oedemes ?? '',
      albumine: v?.albumine ?? '',
      sucre: v?.sucre ?? '',
      hauteurUterine: v?.hauteurUterine ?? '',
      bcf: v?.bcf ?? '',
      mouvementsActifs: v?.mouvementsActifs ?? '',
      tv: v?.tv ?? '',
      presentation: v?.presentation ?? '',
      spDose: v?.spDose ?? null,
      mildaRemise: champBooleen(v?.mildaRemise),
      ferFolate: champBooleen(v?.ferFolate),
      deparasitee: champBooleen(v?.deparasitee),
      counselingPfppi: champBooleen(v?.counselingPfppi),
      risqueDepiste: champBooleen(v?.risqueDepiste),
      malnutrition: champBooleen(v?.malnutrition),
      anemie: champBooleen(v?.anemie),
      syphilisPositif: champBooleen(v?.syphilisPositif),
      agHbsPositif: champBooleen(v?.agHbsPositif),
      conseils: v?.conseils ?? '',
      prochaineVisite: v?.prochaineVisite ? v.prochaineVisite.slice(0, 10) : '',
    })
    // Âge gestationnel précalculé depuis la DDR (s'il n'a pas été saisi)
    const ddrInit = (d ?? detail)?.dossier?.ddr ? (d ?? detail).dossier.ddr.slice(0, 10) : ''
    if (ddrInit && !v?.ageGestationnelSA) {
      setFormCpn((f: any) => ({
        ...f,
        ageGestationnelSA: calculerAgeGestationnel(ddrInit, f.date || undefined),
      }))
    }
  }

  /** Âge gestationnel depuis la DDR (ex. « 16 SA + 3 j »), à une date donnée sinon aujourd'hui. */
  function calculerAgeGestationnel(ddr: string, dateRef?: string) {
    if (!ddr) return ''
    const debut = new Date(ddr)
    const fin = dateRef ? new Date(dateRef) : new Date()
    if (isNaN(debut.getTime()) || fin < debut) return ''
    const jours = Math.floor((fin.getTime() - debut.getTime()) / (24 * 3600 * 1000))
    return `${Math.floor(jours / 7)} SA + ${jours % 7} j`
  }

  /** Terme prévu : intervalle DDR + 280 j ± 15 jours (affiché, non modifiable). */
  function termePrevu() {
    if (!formCpn.ddr) return '—'
    const ddr = new Date(formCpn.ddr)
    const dpa = new Date(ddr.getTime() + 280 * 24 * 3600 * 1000)
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR')
    const debut = new Date(dpa.getTime() - 15 * 24 * 3600 * 1000)
    const fin = new Date(dpa.getTime() + 15 * 24 * 3600 * 1000)
    return `du ${fmt(debut)} au ${fmt(fin)}`
  }

  function setF(key: string, value: any) {
    // Recalcul automatique de l'âge gestationnel quand la DDR change
    if (key === 'ddr' && value) {
      setFormCpn((f: any) => ({
        ...f,
        ddr: value,
        ageGestationnelSA: calculerAgeGestationnel(value, f.date || undefined),
      }))
      return
    }
    setFormCpn((f: any) => ({ ...f, [key]: value }))
  }

  const CHAMPS_DOSSIER = [
    'modeEntree', 'numeroGestante', 'ddr', 'gravidite', 'parite', 'enfantsVivants', 'enfantsDecedes',
    'cesariennes', 'avortements', 'toxemie', 'antecedentsMedicaux', 'antecedentsChirurgicaux',
    'antecedentsObstetricaux', 'vatStatut', 'vat1', 'vat2', 'vatRappel', 'statutVih', 'dateDerniereCpn',
  ]
  const CHAMPS_PATIENT = [
    'nom', 'prenom', 'age', 'profession', 'nationalite', 'statutConjugal',
    'scolarisation', 'residenceHabituelle', 'residenceActuelle', 'telephone',
  ]
  const CHAMPS_VISITE = [
    'numero', 'date', 'ageGestationnelSA', 'poids', 'taille', 'tensionGauche', 'tensionDroite',
    'hauteurUterine', 'bcf', 'mouvementsActifs', 'oedemes', 'albumine', 'sucre',
    'presentation', 'tv', 'conseils', 'prochaineVisite', 'spDose', 'mildaRemise',
    'ferFolate', 'deparasitee', 'counselingPfppi', 'risqueDepiste', 'malnutrition',
    'anemie', 'syphilisPositif', 'agHbsPositif',
  ]

  function extraire(champs: string[], form: any) {
    const out: any = {}
    for (const c of champs) out[c] = form[c]
    return out
  }

  function booleen(v: string): boolean | null {
    if (v === 'true') return true
    if (v === 'false') return false
    return null
  }

  async function enregistrerCpn() {
    if (!formCpn.date || !formCpn.ddr) {
      Alert.alert('CPN', 'La date et la DDR sont obligatoires.')
      return
    }
    setSaving(true)
    try {
      let dossierId = dossier?.id
      const dossierPayload = payloadNettoye(extraire(CHAMPS_DOSSIER, formCpn))
      if (dossierId) {
        await http.patch(`/maternite/grossesses/${dossierId}`, dossierPayload)
      } else {
        const { data } = await http.post('/maternite/grossesses', {
          ...dossierPayload,
          cliniqueId,
          patientId: detail.passage.patientId,
        })
        dossierId = data.id
      }
      await http.patch(`/accueil/passages/${passage.id}`, {
        patient: payloadNettoye(extraire(CHAMPS_PATIENT, formCpn)),
      })
      const visitePayload = payloadNettoye(extraire(CHAMPS_VISITE, formCpn))
      for (const k of ['mildaRemise', 'ferFolate', 'deparasitee', 'counselingPfppi', 'risqueDepiste', 'malnutrition', 'anemie', 'syphilisPositif', 'agHbsPositif']) {
        if (visitePayload[k] !== undefined && visitePayload[k] !== null) visitePayload[k] = booleen(visitePayload[k])
      }
      if (visiteEnEdition) {
        await http.patch(`/maternite/cpn/${visiteEnEdition.id}`, visitePayload)
        Alert.alert('✅ Visite CPN corrigée')
      } else {
        await http.post(`/maternite/grossesses/${dossierId}/cpn`, visitePayload)
        Alert.alert('✅ CPN enregistrée')
      }
      setVisiteEnEdition(null)
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  function editerVisite(v: any) {
    setVisiteEnEdition(v)
    initFormCpn()
  }

  // ───────────────────────── CPoN ─────────────────────────

  function initFormCpon(d?: any) {
    const g = (d ?? detail)?.dossier
    const pat = (d ?? detail)?.passage?.patient
    const c = cponEnEdition
    setFormCpon({
      date: c?.date ? c.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      typeCpon: c?.typeCpon ?? '',
      modeEntree: c?.modeEntree ?? '',
      numeroGestanteReport: c?.numeroGestanteReport ?? g?.numeroGestante ?? '',
      nom: pat?.nom ?? '',
      prenom: pat?.prenom ?? '',
      age: pat?.age != null ? String(pat.age) : '',
      statutConjugal: pat?.statutConjugal ?? '',
      scolarisation: pat?.scolarisation ?? '',
      residenceHabituelle: pat?.residenceHabituelle ?? '',
      residenceActuelle: pat?.residenceActuelle ?? '',
      telephone: pat?.telephone ?? '',
      gravidite: g?.gravidite != null ? String(g.gravidite) : '',
      parite: g?.parite != null ? String(g.parite) : '',
      enfantsVivants: g?.enfantsVivants != null ? String(g.enfantsVivants) : '',
      enfantsDecedes: g?.enfantsDecedes != null ? String(g.enfantsDecedes) : '',
      cesariennes: g?.cesariennes != null ? String(g.cesariennes) : '',
      avortements: g?.avortements != null ? String(g.avortements) : '',
      toxemie: g?.toxemie ?? '',
      antecedentsMedicaux: g?.antecedentsMedicaux ?? '',
      antecedentsChirurgicaux: g?.antecedentsChirurgicaux ?? '',
      dateAccouchement: c?.dateAccouchement ? c.dateAccouchement.slice(0, 10) : g?.accouchement?.dateHeure ? String(g.accouchement.dateHeure).slice(0, 10) : '',
      lieuAccouchement: c?.lieuAccouchement ?? '',
      modeAccouchement: c?.modeAccouchement ?? '',
      numeroDepistagePec: c?.numeroDepistagePec ?? '',
      statutVih: c?.statutVih ?? '',
      examenMere: c?.examenMere ?? '',
      examenEnfant: c?.examenEnfant ?? '',
      conseils: c?.conseils ?? '',
      observations: c?.observations ?? '',
    })
  }

  function setFC(key: string, value: any) {
    setFormCpon((f: any) => ({ ...f, [key]: value }))
  }

  const CHAMPS_CPON = [
    'date', 'typeCpon', 'modeEntree', 'numeroGestanteReport', 'dateAccouchement',
    'lieuAccouchement', 'modeAccouchement', 'numeroDepistagePec', 'statutVih',
    'examenMere', 'examenEnfant', 'conseils', 'observations',
  ]

  async function enregistrerCpon() {
    if (!formCpon.date) {
      Alert.alert('CPoN', 'La date est obligatoire.')
      return
    }
    setSaving(true)
    try {
      await http.patch(`/accueil/passages/${passage.id}`, {
        patient: payloadNettoye(extraire(CHAMPS_PATIENT, formCpon)),
      })
      if (dossier) {
        await http.patch(`/maternite/grossesses/${dossier.id}`, payloadNettoye(extraire(CHAMPS_DOSSIER, formCpon)))
      }
      const champs = payloadNettoye(extraire(CHAMPS_CPON, formCpon))
      if (cponEnEdition) {
        await http.patch(`/maternite/cpon/${cponEnEdition.id}`, champs)
        Alert.alert('✅ CPoN corrigée')
      } else {
        await http.post(`/maternite/passages/${passage.id}/cpon`, {
          ...champs,
          grossesseId: dossier?.id ?? undefined,
        })
        Alert.alert('✅ Consultation postnatale enregistrée')
      }
      setCponEnEdition(null)
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  // ───────────────────────── Accouchement ─────────────────────────

  function initFormAcc(d?: any) {
    const a = (d ?? detail)?.dossier?.accouchement
    setFormAcc({
      dateHeure: a?.dateHeure ? new Date(a.dateHeure).toISOString().slice(0, 16) : '',
      numeroAccouchement: a?.numeroAccouchement != null ? String(a.numeroAccouchement) : '',
      modeEntree: a?.modeEntree ?? '',
      heureArrivee: a?.heureArrivee ? new Date(a.heureArrivee).toISOString().slice(0, 16) : '',
      motifAdmission: a?.motifAdmission ?? '',
      enTravail: champBooleen(a?.enTravail),
      contractions: a?.contractions ?? '',
      pocheEauxIntacte: champBooleen(a?.pocheEauxIntacte),
      liquideAspect: a?.liquideAspect ?? '',
      ruptureHeures: a?.ruptureHeures != null ? String(a.ruptureHeures) : '',
      voie: a?.voie ?? 'VOIE_BASSE',
      termeSA: a?.termeSA ?? '',
      htaConnue: champBooleen(a?.htaConnue),
      diabeteConnu: champBooleen(a?.diabeteConnu),
      toxemie: a?.toxemie ?? '',
      enfantsVivants: a?.enfantsVivants != null ? String(a.enfantsVivants) : '',
      enfantsDecedes: a?.enfantsDecedes != null ? String(a.enfantsDecedes) : '',
      cesariennes: a?.cesariennes != null ? String(a.cesariennes) : '',
      avortements: a?.avortements != null ? String(a.avortements) : '',
      gemellite: a?.gemellite != null ? String(a.gemellite) : '',
      prematurite: a?.prematurite != null ? String(a.prematurite) : '',
      antecedentsMedicaux: a?.antecedentsMedicaux ?? '',
      antecedentsChirurgicaux: a?.antecedentsChirurgicaux ?? '',
      ageGrossessePremiereCpn: a?.ageGrossessePremiereCpn ?? '',
      nombreCpn: a?.nombreCpn != null ? String(a.nombreCpn) : '',
      vatStatut: a?.vatStatut ?? '',
      statutVihAccueil: a?.statutVihAccueil ?? '',
      sousTarvCpn: champBooleen(a?.sousTarvCpn),
      numeroPec: a?.numeroPec ?? '',
      offreTestVih: champBooleen(a?.offreTestVih),
      resultatTestVih: a?.resultatTestVih ?? '',
      delivranceLe: a?.delivranceLe ? new Date(a.delivranceLe).toISOString().slice(0, 16) : '',
      revisionUterine: champBooleen(a?.revisionUterine),
      ubt: champBooleen(a?.ubt),
      hppi: champBooleen(a?.hppi),
      sexeEnfant: a?.sexeEnfant ?? '',
      poidsEnfant: a?.poidsEnfant != null ? String(a.poidsEnfant) : '',
      apgar: a?.apgar ?? '',
      perimetreCranienEnfant: a?.perimetreCranienEnfant ?? '',
      reanimationNn: champBooleen(a?.reanimationNn),
      issueMere: a?.issueMere ?? '',
      issueEnfant: a?.issueEnfant ?? '',
      lieu: a?.lieu ?? '',
      mortNeType: a?.mortNeType ?? '',
      decedeMaternite: champBooleen(a?.decedeMaternite),
      accouchementMultiple: champBooleen(a?.accouchementMultiple),
      sortieMereLe: a?.sortieMereLe ? new Date(a.sortieMereLe).toISOString().slice(0, 16) : '',
      sortieMereMode: a?.sortieMereMode ?? '',
      interventionMedecin: a?.interventionMedecin ?? '',
      complications: a?.complications ?? '',
    })
  }

  function setFA(key: string, value: any) {
    setFormAcc((f: any) => ({ ...f, [key]: value }))
  }

  const CHAMPS_ACC_BOOL = [
    'enTravail', 'pocheEauxIntacte', 'htaConnue', 'diabeteConnu', 'sousTarvCpn',
    'offreTestVih', 'revisionUterine', 'ubt', 'hppi', 'reanimationNn',
    'decedeMaternite', 'accouchementMultiple',
  ]

  async function enregistrerAccouchement() {
    if (!formAcc.dateHeure || !dossier) {
      Alert.alert('Accouchement', 'La date et l’heure sont obligatoires (et le dossier doit exister).')
      return
    }
    setSaving(true)
    try {
      const payload = payloadNettoye(formAcc)
      for (const k of CHAMPS_ACC_BOOL) {
        if (payload[k] !== undefined && payload[k] !== null) payload[k] = booleen(payload[k])
      }
      await http.post(`/maternite/grossesses/${dossier.id}/accouchement`, payload)
      Alert.alert('✅ Accouchement enregistré')
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  // ── Accouchement sans CPN : dossier créé à la demande ──
  const [dossierEnCours, setDossierEnCours] = useState(false)

  async function creerDossierAccouchement() {
    const passageId = detail?.passage?.id
    if (!passageId) return
    setDossierEnCours(true)
    try {
      const { data } = await http.post(`/maternite/passages/${passageId}/dossier`)
      Alert.alert('✅ Dossier créé', `Dossier ${data.numero} — enregistrez maintenant l'accouchement.`)
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Impossible de créer le dossier.')
    } finally {
      setDossierEnCours(false)
    }
  }

  // ───────────────────────── PF ─────────────────────────

  function initFormPf() {
    const p = pfEnEdition
    setFormPf({
      date: p?.date ? p.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      methode: p?.methode ?? '',
      nouvelleUtilisatrice: p ? p.nouvelleUtilisatrice : true,
      protégée: champBooleen(p?.protégée),
      perdueDeVue: champBooleen(p?.perdueDeVue),
      abandon: champBooleen(p?.abandon),
      arretRetrait: champBooleen(p?.arretRetrait),
      conseilPostpartum: champBooleen(p?.conseilPostpartum),
      produitPostpartumImmediat: champBooleen(p?.produitPostpartumImmediat),
      produitPostAbortum: champBooleen(p?.produitPostAbortum),
      femmesFormeesAutoInjection: champBooleen(p?.femmesFormeesAutoInjection),
      istPresente: champBooleen(p?.istPresente),
      seropositive: champBooleen(p?.seropositive),
      nourrisson0_6: champBooleen(p?.nourrisson0_6),
      nourrisson6: champBooleen(p?.nourrisson6),
      observations: p?.observations ?? '',
    })
  }

  function setFP(key: string, value: any) {
    setFormPf((f: any) => ({ ...f, [key]: value }))
  }

  const CHAMPS_PF_BOOL = [
    'protégée', 'perdueDeVue', 'abandon', 'arretRetrait', 'conseilPostpartum',
    'produitPostpartumImmediat', 'produitPostAbortum', 'femmesFormeesAutoInjection',
    'istPresente', 'seropositive', 'nourrisson0_6', 'nourrisson6',
  ]

  async function enregistrerPf() {
    if (!formPf.date || !formPf.methode) {
      Alert.alert('PF', 'La date et la méthode sont obligatoires.')
      return
    }
    setSaving(true)
    try {
      const payload = payloadNettoye(formPf)
      for (const k of CHAMPS_PF_BOOL) {
        if (payload[k] !== undefined && payload[k] !== null) payload[k] = booleen(payload[k])
      }
      if (pfEnEdition) {
        await http.patch(`/maternite/pf/${pfEnEdition.id}`, payload)
        Alert.alert('✅ Consultation PF corrigée')
      } else {
        await http.post(`/maternite/passages/${passage.id}/pf`, payload)
        Alert.alert('✅ Consultation PF enregistrée')
      }
      setPfEnEdition(null)
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  // ───────────────────────── Ordonnance / Examens ─────────────────────────

  const consultation = detail?.passage?.consultation ?? null

  async function assurerConsultation() {
    if (!passage || consultation) return
    try {
      await http.post(`/maternite/passages/${passage.id}/consultation`)
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Impossible d’ouvrir la consultation.')
    }
  }

  async function ajouterMedicament() {
    if (!consultation) return
    if (!medId && !medNom.trim()) {
      Alert.alert('Ordonnance', 'Choisissez un médicament du catalogue ou saisissez un nom.')
      return
    }
    setSaving(true)
    try {
      await http.post(`/consultations/${consultation.id}/medicaments`, {
        medicamentId: medId ?? undefined,
        nom: medNom || undefined,
        posologie: medPoso || undefined,
        quantite: medQte || undefined,
        duree: medDuree || undefined,
      })
      setMedId(null)
      setMedNom('')
      setMedPoso('')
      setMedQte('')
      setMedDuree('')
      Alert.alert('✅ Médicament ajouté')
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Ajout impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function retirerMedicament(m: any) {
    try {
      await http.delete(`/consultations/medicaments/${m.id}`)
      await chargerDetail()
    } catch {
      Alert.alert('Erreur', 'Retrait impossible.')
    }
  }

  const optionsExamens = useMemo(() => {
    const deja = new Set((detail?.passage?.prestations ?? []).map((l: any) => l.prestationId).filter(Boolean))
    return prestations
      .filter((p) => p.actif && p.type !== 'CONSULTATION' && p.type !== 'MATERNITE' && !deja.has(p.id))
      .map((p) => ({ value: p.id, label: p.libelle }))
  }, [prestations, detail])

  const examensPrescrits = (detail?.passage?.prestations ?? []).filter(
    (l: any) => l.prestation?.type !== 'CONSULTATION' && l.prestation?.type !== 'MATERNITE',
  )

  async function ajouterExamen() {
    if (!examenId || !consultation) return
    setSaving(true)
    try {
      await http.post(`/consultations/${consultation.id}/examens/ajouter`, { prestationId: examenId })
      setExamenId(null)
      Alert.alert('✅ Examen ajouté à la prescription — payable à la caisse')
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Ajout impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function ajouterExamenLibre() {
    const libelle = examenLibre.trim()
    if (!libelle || !consultation) return
    setSaving(true)
    try {
      await http.post(`/consultations/${consultation.id}/examens/ajouter`, { libelle })
      setExamenLibre('')
      Alert.alert('✅ Examen externe ajouté (non facturable)')
      await chargerDetail()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Ajout impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function retirerExamen(e: any) {
    try {
      await http.delete(`/consultations/examens/${e.id}`)
      await chargerDetail()
    } catch {
      Alert.alert('Erreur', 'Retrait impossible.')
    }
  }

  // ───────────────────────── Rendu ─────────────────────────

  if (!passage) {
    return (
      <Screen padded={false}>
        <View style={styles.bandeau}>
          <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
            <Text style={styles.btnRetourTexte}>← Modules</Text>
          </TouchableOpacity>
          <Text style={styles.titre}>🤰 Maternité</Text>
          <TextInput
            style={styles.recherche}
            placeholder="Rechercher par code, nom ou N° d'ordre…"
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
              { key: 'attente', label: 'Patients en attente', count: file.length },
              { key: 'termines', label: 'Patients terminés' },
            ]}
          />
          {recherche.trim().length >= 2 ? (
            <>
              {resultats.map((p) => (
                <View key={p.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>{p.patient?.nom} {p.patient?.prenom}</Text>
                    <Text style={styles.itemSous}>{p.numeroOrdre} · {(p.actes ?? []).join(', ')}</Text>
                  </View>
                  <Btn title="🩺 Traitement" small onPress={() => ouvrirTraitement(p)} />
                </View>
              ))}
              {resultats.length === 0 ? <EtatVide texte="Aucune patiente trouvée." /> : null}
            </>
          ) : onglet === 'attente' ? (
            <>
              {recherche.trim().length < 2 ? (
                <Btn
                  title="🚑 Accouchement en urgence"
                  variant="danger"
                  onPress={ouvrirUrgence}
                  style={{ marginBottom: 10 }}
                />
              ) : null}
              {file.length === 0 ? <EtatVide texte="Aucune patiente en attente." /> : null}
              {file.map((p, i) => (
                <View key={p.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>{i + 1}. {p.patient?.nom} {p.patient?.prenom}</Text>
                    <Text style={styles.itemSous}>{p.numeroOrdre} · {(p.actes ?? []).join(', ')}</Text>
                  </View>
                  <Btn title="🩺 Traitement" small onPress={() => ouvrirTraitement(p)} />
                </View>
              ))}
            </>
          ) : (
            <>
              <DateField label="Jour (vide = tous)" value={jourTraites} onChange={(v) => { setJourTraites(v); chargerTraites(1) }} />
              {traites.data?.length === 0 ? <EtatVide texte="Aucune patiente traitée." /> : null}
              {(traites.data ?? []).map((p: any) => (
                <View key={p.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>{p.patient?.nom} {p.patient?.prenom}</Text>
                    <Text style={styles.itemSous}>{p.numeroOrdre} · traitée le {p.materniteTraiteLe ? new Date(p.materniteTraiteLe).toLocaleString('fr-FR') : ''}</Text>
                  </View>
                  <Btn title="👁️ Rouvrir" small variant="outline" onPress={() => ouvrirTraitement(p)} />
                </View>
              ))}
              <PaginationBar page={traites.page ?? 1} totalPages={traites.totalPages ?? 1} onPage={(p) => chargerTraites(p)} />
            </>
          )}
        </View>
      </Screen>
    )
  }

  const patient = detail?.passage?.patient

  return (
    <Screen padded={false}>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={quitter}>
          <Text style={styles.btnRetourTexte}>← Liste</Text>
        </TouchableOpacity>
        <Text style={styles.titre}>🤰 {patient?.nom} {patient?.prenom}</Text>
        <Text style={styles.sousTitre}>{passage.numeroOrdre} · {patient?.age ?? '—'} ans</Text>
        <View style={styles.actionsLigne}>
          <Btn title="✅ Terminer la prise en charge" small variant="outline" onPress={terminer} />
        </View>
      </View>

      <View style={{ padding: 12 }}>
        <Onglets
          actif={ongletT}
          onChange={(k) => setOngletT(k as typeof ongletT)}
          tabs={[
            { key: 'cpn', label: 'CPN' },
            { key: 'cpon', label: 'CPoN' },
            { key: 'accouchement', label: 'Accouch.' },
            { key: 'pf', label: 'PF' },
            { key: 'ordonnance', label: 'Ordonn.' },
            { key: 'examens', label: 'Examens' },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }}>
        {/* ── CPN ── */}
        {ongletT === 'cpn' ? (
          <Card>
            <SectionTitle>Registre CPN</SectionTitle>
            <Input label="Date de la consultation *" value={formCpn.date} onChangeText={(t) => setF('date', t)} placeholder="AAAA-MM-JJ" />
            <Input label="Mode d'entrée">
              <ListeSelect
                value={formCpn.modeEntree}
                options={[
                  { value: 'VENUE_DIRECTE', label: "Venue d'elle-même" },
                  { value: 'REFERE_CENTRE', label: "Référée d'un centre" },
                  { value: 'REFERE_TRADIPRATICIEN', label: 'Référée par un tradipraticien' },
                  { value: 'AUTRE', label: 'Autre' },
                ]}
                placeholder="— Choisir —"
                onChange={(v) => setF('modeEntree', v as string)}
              />
            </Input>
            <Input label="N° gestante" value={formCpn.numeroGestante ?? ''} onChangeText={(t) => setF('numeroGestante', t)} placeholder="ex : 08/B/2026/CPN1/R1/P10" />
            <Input label="Nom *" value={formCpn.nom ?? ''} onChangeText={(t) => setF('nom', t)} />
            <Input label="Prénoms" value={formCpn.prenom ?? ''} onChangeText={(t) => setF('prenom', t)} />
            <Input label="Âge (ans)" value={formCpn.age ?? ''} onChangeText={(t) => setF('age', t)} keyboardType="numeric" />
            <ListeCombo label="Profession" value={formCpn.profession ?? ''} options={listes.profession ?? []} placeholder="— Choisir —" onChange={(v) => setF('profession', v)} />
            <ListeCombo label="Nationalité" value={formCpn.nationalite ?? ''} options={listes.nationalite ?? []} placeholder="— Choisir —" onChange={(v) => setF('nationalite', v)} />
            <ListeCombo label="Résidence habituelle" value={formCpn.residenceHabituelle ?? ''} options={listes.residence ?? []} placeholder="— Choisir —" onChange={(v) => setF('residenceHabituelle', v)} />
            <ListeCombo label="Résidence actuelle" value={formCpn.residenceActuelle ?? ''} options={listes.residence ?? []} placeholder="— Choisir —" onChange={(v) => setF('residenceActuelle', v)} />
            <Input label="Contacts téléphoniques" value={formCpn.telephone ?? ''} onChangeText={(t) => setF('telephone', t)} keyboardType="phone-pad" />
            <SectionTitle>Antécédents</SectionTitle>
            <Input label="Gestité" value={formCpn.gravidite ?? ''} onChangeText={(t) => setF('gravidite', t)} keyboardType="numeric" />
            <Input label="Parité" value={formCpn.parite ?? ''} onChangeText={(t) => setF('parite', t)} keyboardType="numeric" />
            <Input label="Enfants vivants" value={formCpn.enfantsVivants ?? ''} onChangeText={(t) => setF('enfantsVivants', t)} keyboardType="numeric" />
            <Input label="Enfants décédés" value={formCpn.enfantsDecedes ?? ''} onChangeText={(t) => setF('enfantsDecedes', t)} keyboardType="numeric" />
            <Input label="Césariennes" value={formCpn.cesariennes ?? ''} onChangeText={(t) => setF('cesariennes', t)} keyboardType="numeric" />
            <Input label="Avortements" value={formCpn.avortements ?? ''} onChangeText={(t) => setF('avortements', t)} keyboardType="numeric" />
            <Input label="Antécédents médicaux" value={formCpn.antecedentsMedicaux ?? ''} onChangeText={(t) => setF('antecedentsMedicaux', t)} multiline />
            <Input label="Antécédents chirurgicaux" value={formCpn.antecedentsChirurgicaux ?? ''} onChangeText={(t) => setF('antecedentsChirurgicaux', t)} multiline />
            <SectionTitle>Grossesse</SectionTitle>
            <DateField label="DDR (date des dernières règles) *" value={formCpn.ddr ?? ''} onChange={(v) => setF('ddr', v)} />
            <InfoLigne label="Terme prévu (intervalle calculé)" value={termePrevu()} />
            <Input label="Âge gestationnel (calculé, modifiable)" value={formCpn.ageGestationnelSA ?? ''} onChangeText={(t) => setF('ageGestationnelSA', t)} placeholder="Ex : 16 SA + 3 j" />
            <DateField label="Date de la dernière CPN" value={formCpn.dateDerniereCpn ?? ''} onChange={(v) => setF('dateDerniereCpn', v)} />
            <Input label="Rang de la visite">
              <ListeSelect
                value={formCpn.numero}
                options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `CPN${n}` }))}
                placeholder="— Choisir —"
                onChange={(v) => setF('numero', v as number)}
              />
            </Input>
            <SectionTitle>VAT et VIH</SectionTitle>
            <Input label="Statut VAT">
              <ListeSelect
                value={formCpn.vatStatut}
                options={[
                  { value: 'NON_VACCINEE', label: 'Non vaccinée' },
                  { value: 'INCOMPLETEMENT_VACCINEE', label: 'Incomplètement vaccinée' },
                  { value: 'CORRECTEMENT_VACCINEE', label: 'Correctement vaccinée' },
                ]}
                placeholder="— Choisir —"
                onChange={(v) => setF('vatStatut', v as string)}
              />
            </Input>
            <DateField label="Date VAT1" value={formCpn.vat1 ?? ''} onChange={(v) => setF('vat1', v)} />
            <DateField label="Date VAT2" value={formCpn.vat2 ?? ''} onChange={(v) => setF('vat2', v)} />
            <DateField label="Date VAT rappel" value={formCpn.vatRappel ?? ''} onChange={(v) => setF('vatRappel', v)} />
            <Input label="Statut VIH à l'accueil">
              <ListeSelect
                value={formCpn.statutVih}
                options={[
                  { value: 'POSITIF', label: 'Positif' },
                  { value: 'NEGATIF', label: 'Négatif' },
                  { value: 'INCONNU', label: 'Inconnu' },
                ]}
                placeholder="— Choisir —"
                onChange={(v) => setF('statutVih', v as string)}
              />
            </Input>
            <SectionTitle>Examen clinique</SectionTitle>
            <Input label="Poids (kg)" value={formCpn.poids ?? ''} onChangeText={(t) => setF('poids', t)} keyboardType="numeric" />
            <Input label="Taille (cm)" value={formCpn.taille ?? ''} onChangeText={(t) => setF('taille', t)} />
            <Input label="TA gauche" value={formCpn.tensionGauche ?? ''} onChangeText={(t) => setF('tensionGauche', t)} placeholder="12/8" />
            <Input label="TA droite" value={formCpn.tensionDroite ?? ''} onChangeText={(t) => setF('tensionDroite', t)} placeholder="12/8" />
            <Input label="Hauteur utérine (cm)" value={formCpn.hauteurUterine ?? ''} onChangeText={(t) => setF('hauteurUterine', t)} />
            <Input label="BCF" value={formCpn.bcf ?? ''} onChangeText={(t) => setF('bcf', t)} />
            <Input label="Œdèmes" value={formCpn.oedemes ?? ''} onChangeText={(t) => setF('oedemes', t)} placeholder="Oui / Non" />
            <Input label="Albumine" value={formCpn.albumine ?? ''} onChangeText={(t) => setF('albumine', t)} />
            <Input label="Sucre" value={formCpn.sucre ?? ''} onChangeText={(t) => setF('sucre', t)} />
            <Input label="Présentation" value={formCpn.presentation ?? ''} onChangeText={(t) => setF('presentation', t)} />
            <Input label="TV" value={formCpn.tv ?? ''} onChangeText={(t) => setF('tv', t)} />
            <SectionTitle>Prévention et dépistages</SectionTitle>
            <Input label="Dose de SP donnée">
              <ListeSelect
                value={formCpn.spDose}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `SP — dose ${n}` }))}
                placeholder="— Choisir —"
                onChange={(v) => setF('spDose', v as number)}
              />
            </Input>
            <Input label="MILDA remise" value={formCpn.mildaRemise ?? ''} onChangeText={(t) => setF('mildaRemise', t)} placeholder="Oui / Non" />
            <Input label="Fer + Folate" value={formCpn.ferFolate ?? ''} onChangeText={(t) => setF('ferFolate', t)} placeholder="Oui / Non" />
            <Input label="Déparasitée" value={formCpn.deparasitee ?? ''} onChangeText={(t) => setF('deparasitee', t)} placeholder="Oui / Non" />
            <Input label="Counseling PFPPI + nutrition" value={formCpn.counselingPfppi ?? ''} onChangeText={(t) => setF('counselingPfppi', t)} placeholder="Oui / Non" />
            <Input label="Grossesse à risque dépistée" value={formCpn.risqueDepiste ?? ''} onChangeText={(t) => setF('risqueDepiste', t)} placeholder="Oui / Non" />
            <Input label="Malnutrition" value={formCpn.malnutrition ?? ''} onChangeText={(t) => setF('malnutrition', t)} placeholder="Oui / Non" />
            <Input label="Anémie" value={formCpn.anemie ?? ''} onChangeText={(t) => setF('anemie', t)} placeholder="Oui / Non" />
            <Input label="Syphilis positive" value={formCpn.syphilisPositif ?? ''} onChangeText={(t) => setF('syphilisPositif', t)} placeholder="Oui / Non" />
            <Input label="AgHBs positive" value={formCpn.agHbsPositif ?? ''} onChangeText={(t) => setF('agHbsPositif', t)} placeholder="Oui / Non" />
            <Input label="Conseils donnés" value={formCpn.conseils ?? ''} onChangeText={(t) => setF('conseils', t)} multiline />
            <DateField label="Prochaine visite" value={formCpn.prochaineVisite ?? ''} onChange={(v) => setF('prochaineVisite', v)} />
            <View style={{ marginTop: 10 }}>
              <Btn title={visiteEnEdition ? '💾 Corriger la visite' : `💾 Enregistrer la CPN${(dossier?.visites?.length ?? 0) + 1}`} onPress={enregistrerCpn} loading={saving} />
            </View>

            <SectionTitle>Visites enregistrées</SectionTitle>
            {(dossier?.visites ?? []).length === 0 ? <EtatVide texte="Aucune visite." /> : null}
            {(dossier?.visites ?? []).map((v: any) => (
              <View key={v.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitre}>CPN{v.numero} — {v.date ? new Date(v.date).toLocaleDateString('fr-FR') : ''}</Text>
                  <Text style={styles.itemSous}>SA {v.ageGestationnelSA ?? '—'} · Poids {v.poids ?? '—'} kg · TA {v.tensionGauche ?? '—'}</Text>
                </View>
                <Btn title="✏️" small variant="outline" onPress={() => editerVisite(v)} />
              </View>
            ))}
          </Card>
        ) : null}

        {/* ── CPoN ── */}
        {ongletT === 'cpon' ? (
          <Card>
            <SectionTitle>Registre CPoN</SectionTitle>
            <DateField label="Date *" value={formCpon.date ?? ''} onChange={(v) => setFC('date', v)} />
            <Input label="Type de consultation postnatale">
              <ListeSelect
                value={formCpon.typeCpon}
                options={[
                  { value: 'IMMEDIATE_6_72H', label: 'Immédiate (6 à 72 h)' },
                  { value: '6_10_JOURS', label: '6ᵉ à 10ᵉ jour' },
                  { value: 'AUTRES_PERIODES', label: 'Autres périodes' },
                  { value: '6_8_SEMAINES', label: '6ᵉ à 8ᵉ semaine' },
                ]}
                placeholder="— Choisir —"
                onChange={(v) => setFC('typeCpon', v as string)}
              />
            </Input>
            <Input label="Report N° gestante" value={formCpon.numeroGestanteReport ?? ''} onChangeText={(t) => setFC('numeroGestanteReport', t)} />
            <DateField label="Date d'accouchement" value={formCpon.dateAccouchement ?? ''} onChange={(v) => setFC('dateAccouchement', v)} />
            <Input label="Lieu d'accouchement">
              <ListeSelect
                value={formCpon.lieuAccouchement}
                options={[
                  { value: 'ETABLISSEMENT', label: 'Établissement de soins' },
                  { value: 'DOMICILE', label: 'Domicile' },
                ]}
                placeholder="— Choisir —"
                onChange={(v) => setFC('lieuAccouchement', v as string)}
              />
            </Input>
            <Input label="Mode d'accouchement">
              <ListeSelect
                value={formCpon.modeAccouchement}
                options={[
                  { value: 'VOIE_BASSE', label: 'Voie basse' },
                  { value: 'CESARIENNE', label: 'Césarienne' },
                ]}
                placeholder="— Choisir —"
                onChange={(v) => setFC('modeAccouchement', v as string)}
              />
            </Input>
            <ListeCombo label="Résidence habituelle" value={formCpon.residenceHabituelle ?? ''} options={listes.residence ?? []} placeholder="— Choisir —" onChange={(v) => setFC('residenceHabituelle', v)} />
            <ListeCombo label="Résidence actuelle" value={formCpon.residenceActuelle ?? ''} options={listes.residence ?? []} placeholder="— Choisir —" onChange={(v) => setFC('residenceActuelle', v)} />
            <Input label="N° de dépistage / PEC VIH" value={formCpon.numeroDepistagePec ?? ''} onChangeText={(t) => setFC('numeroDepistagePec', t)} />
            <Input label="Examen de la mère" value={formCpon.examenMere ?? ''} onChangeText={(t) => setFC('examenMere', t)} multiline />
            <Input label="Examen du nouveau-né" value={formCpon.examenEnfant ?? ''} onChangeText={(t) => setFC('examenEnfant', t)} multiline />
            <Input label="Conseils" value={formCpon.conseils ?? ''} onChangeText={(t) => setFC('conseils', t)} multiline />
            <Input label="Observations" value={formCpon.observations ?? ''} onChangeText={(t) => setFC('observations', t)} multiline />
            <View style={{ marginTop: 10 }}>
              <Btn title={cponEnEdition ? '💾 Corriger la CPoN' : '💾 Enregistrer la CPoN'} onPress={enregistrerCpon} loading={saving} />
            </View>
            <SectionTitle>CPoN enregistrées</SectionTitle>
            {cpons.length === 0 ? <EtatVide texte="Aucune consultation." /> : null}
            {cpons.map((c: any) => (
              <View key={c.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitre}>{c.date ? new Date(c.date).toLocaleDateString('fr-FR') : ''} — {c.typeCpon ?? '—'}</Text>
                  <Text style={styles.itemSous}>Report : {c.numeroGestanteReport ?? '—'}</Text>
                </View>
                <Btn title="✏️" small variant="outline" onPress={() => { setCponEnEdition(c); initFormCpon() }} />
              </View>
            ))}
          </Card>
        ) : null}

        {/* ── Accouchement ── */}
        {ongletT === 'accouchement' ? (
          <Card>
            <SectionTitle>Registre d'accouchement</SectionTitle>
            {!dossier ? (
              <View>
                <EtatVide texte="Cette patiente n'a pas de dossier de grossesse (elle n'a pas fait de CPN)." />
                <Btn
                  title="📂 Créer le dossier pour cet accouchement"
                  onPress={creerDossierAccouchement}
                  loading={dossierEnCours}
                />
              </View>
            ) : (
              <>
                <Input label="Date et heure *" value={formAcc.dateHeure ?? ''} onChangeText={(t) => setFA('dateHeure', t)} placeholder="AAAA-MM-JJTHH:MM" />
                <Input label="Numéro d'accouchement" value={formAcc.numeroAccouchement ?? ''} onChangeText={(t) => setFA('numeroAccouchement', t)} keyboardType="numeric" />
                <Input label="Motif d'admission" value={formAcc.motifAdmission ?? ''} onChangeText={(t) => setFA('motifAdmission', t)} />
                <Input label="En travail" value={formAcc.enTravail ?? ''} onChangeText={(t) => setFA('enTravail', t)} placeholder="Oui / Non" />
                <Input label="Contractions" value={formAcc.contractions ?? ''} onChangeText={(t) => setFA('contractions', t)} placeholder="Régulières / Irrégulières / Non" />
                <Input label="Poche des eaux intacte" value={formAcc.pocheEauxIntacte ?? ''} onChangeText={(t) => setFA('pocheEauxIntacte', t)} placeholder="Oui / Non" />
                <Input label="Aspect du liquide" value={formAcc.liquideAspect ?? ''} onChangeText={(t) => setFA('liquideAspect', t)} placeholder="Clair / Teinté / Méconial" />
                <Input label="Heures depuis rupture" value={formAcc.ruptureHeures ?? ''} onChangeText={(t) => setFA('ruptureHeures', t)} keyboardType="numeric" />
                <Input label="Voie">
                  <ListeSelect
                    value={formAcc.voie}
                    options={[
                      { value: 'VOIE_BASSE', label: 'Voie basse' },
                      { value: 'CESARIENNE', label: 'Césarienne' },
                    ]}
                    onChange={(v) => setFA('voie', v as string)}
                  />
                </Input>
                <Input label="Terme (SA)" value={formAcc.termeSA ?? ''} onChangeText={(t) => setFA('termeSA', t)} />
                <Input label="HTA connue" value={formAcc.htaConnue ?? ''} onChangeText={(t) => setFA('htaConnue', t)} placeholder="Oui / Non" />
                <Input label="Diabète connu" value={formAcc.diabeteConnu ?? ''} onChangeText={(t) => setFA('diabeteConnu', t)} placeholder="Oui / Non" />
                <Input label="Enfants vivants" value={formAcc.enfantsVivants ?? ''} onChangeText={(t) => setFA('enfantsVivants', t)} keyboardType="numeric" />
                <Input label="Césariennes antérieures" value={formAcc.cesariennes ?? ''} onChangeText={(t) => setFA('cesariennes', t)} keyboardType="numeric" />
                <Input label="Avortements" value={formAcc.avortements ?? ''} onChangeText={(t) => setFA('avortements', t)} keyboardType="numeric" />
                <Input label="Âge grossesse 1ère CPN" value={formAcc.ageGrossessePremiereCpn ?? ''} onChangeText={(t) => setFA('ageGrossessePremiereCpn', t)} />
                <Input label="Nombre de CPN" value={formAcc.nombreCpn ?? ''} onChangeText={(t) => setFA('nombreCpn', t)} keyboardType="numeric" />
                <Input label="Statut VAT">
                  <ListeSelect
                    value={formAcc.vatStatut}
                    options={[
                      { value: 'NON_VACCINEE', label: 'Non vaccinée' },
                      { value: 'INCOMPLETEMENT_VACCINEE', label: 'Incomplètement vaccinée' },
                      { value: 'CORRECTEMENT_VACCINEE', label: 'Correctement vaccinée' },
                    ]}
                    placeholder="— Choisir —"
                    onChange={(v) => setFA('vatStatut', v as string)}
                  />
                </Input>
                <Input label="Statut VIH à l'accueil" value={formAcc.statutVihAccueil ?? ''} onChangeText={(t) => setFA('statutVihAccueil', t)} placeholder="Positif / Négatif / Inconnu" />
                <Input label="N° de PEC" value={formAcc.numeroPec ?? ''} onChangeText={(t) => setFA('numeroPec', t)} />
                <Input label="Test VIH proposé" value={formAcc.offreTestVih ?? ''} onChangeText={(t) => setFA('offreTestVih', t)} placeholder="Oui / Non" />
                <Input label="Résultat du test VIH" value={formAcc.resultatTestVih ?? ''} onChangeText={(t) => setFA('resultatTestVih', t)} placeholder="Positif / Négatif" />
                <Input label="Délivrance à" value={formAcc.delivranceLe ?? ''} onChangeText={(t) => setFA('delivranceLe', t)} placeholder="AAAA-MM-JJTHH:MM" />
                <Input label="Révision utérine" value={formAcc.revisionUterine ?? ''} onChangeText={(t) => setFA('revisionUterine', t)} placeholder="Oui / Non" />
                <Input label="UBT" value={formAcc.ubt ?? ''} onChangeText={(t) => setFA('ubt', t)} placeholder="Oui / Non" />
                <Input label="HPPI" value={formAcc.hppi ?? ''} onChangeText={(t) => setFA('hppi', t)} placeholder="Oui / Non" />
                <Input label="Sexe de l'enfant">
                  <ListeSelect
                    value={formAcc.sexeEnfant}
                    options={[
                      { value: 'M', label: 'Masculin' },
                      { value: 'F', label: 'Féminin' },
                    ]}
                    placeholder="— Choisir —"
                    onChange={(v) => setFA('sexeEnfant', v as string)}
                  />
                </Input>
                <Input label="Poids de l'enfant (kg)" value={formAcc.poidsEnfant ?? ''} onChangeText={(t) => setFA('poidsEnfant', t)} keyboardType="numeric" />
                <Input label="APGAR" value={formAcc.apgar ?? ''} onChangeText={(t) => setFA('apgar', t)} />
                <Input label="Périmètre crânien (cm)" value={formAcc.perimetreCranienEnfant ?? ''} onChangeText={(t) => setFA('perimetreCranienEnfant', t)} />
                <Input label="Réanimation NN" value={formAcc.reanimationNn ?? ''} onChangeText={(t) => setFA('reanimationNn', t)} placeholder="Oui / Non" />
                <Input label="Issue mère" value={formAcc.issueMere ?? ''} onChangeText={(t) => setFA('issueMere', t)} placeholder="Vivante / Décédée / Transférée" />
                <Input label="Issue enfant" value={formAcc.issueEnfant ?? ''} onChangeText={(t) => setFA('issueEnfant', t)} placeholder="Né vivant / Mort-né / Transféré" />
                <Input label="Lieu" value={formAcc.lieu ?? ''} onChangeText={(t) => setFA('lieu', t)} />
                <Input label="Mort-né (type)" value={formAcc.mortNeType ?? ''} onChangeText={(t) => setFA('mortNeType', t)} placeholder="Frais / Macéré" />
                <Input label="Décédé à la maternité" value={formAcc.decedeMaternite ?? ''} onChangeText={(t) => setFA('decedeMaternite', t)} placeholder="Oui / Non" />
                <Input label="Accouchement multiple" value={formAcc.accouchementMultiple ?? ''} onChangeText={(t) => setFA('accouchementMultiple', t)} placeholder="Oui / Non" />
                <Input label="Sortie de la mère le" value={formAcc.sortieMereLe ?? ''} onChangeText={(t) => setFA('sortieMereLe', t)} placeholder="AAAA-MM-JJTHH:MM" />
                <Input label="Mode de sortie" value={formAcc.sortieMereMode ?? ''} onChangeText={(t) => setFA('sortieMereMode', t)} />
                <Input label="Intervention du médecin" value={formAcc.interventionMedecin ?? ''} onChangeText={(t) => setFA('interventionMedecin', t)} />
                <Input label="Complications" value={formAcc.complications ?? ''} onChangeText={(t) => setFA('complications', t)} multiline />
                <View style={{ marginTop: 10 }}>
                  <Btn title={dossier?.accouchement ? '💾 Enregistrer les modifications' : '💾 Enregistrer l’accouchement'} onPress={enregistrerAccouchement} loading={saving} />
                </View>
              </>
            )}
          </Card>
        ) : null}

        {/* ── PF ── */}
        {ongletT === 'pf' ? (
          <Card>
            <SectionTitle>Registre PF</SectionTitle>
            <DateField label="Date *" value={formPf.date ?? ''} onChange={(v) => setFP('date', v)} />
            <Input label="Méthode contraceptive *">
              <ListeSelect
                value={formPf.methode}
                options={METHODES_PF.map((m) => ({ value: m, label: m }))}
                placeholder="— Choisir —"
                onChange={(v) => setFP('methode', v as string)}
              />
            </Input>
            <Input label="Statut de l'utilisatrice">
              <ListeSelect
                value={formPf.nouvelleUtilisatrice ? 'true' : 'false'}
                options={[
                  { value: 'true', label: 'Nouvelle utilisatrice' },
                  { value: 'false', label: 'Ancienne utilisatrice' },
                ]}
                onChange={(v) => setFP('nouvelleUtilisatrice', v === 'true')}
              />
            </Input>
            <Input label="Protégée" value={formPf.protégée ?? ''} onChangeText={(t) => setFP('protégée', t)} placeholder="Oui / Non" />
            <Input label="Perdue de vue" value={formPf.perdueDeVue ?? ''} onChangeText={(t) => setFP('perdueDeVue', t)} placeholder="Oui / Non" />
            <Input label="Abandon" value={formPf.abandon ?? ''} onChangeText={(t) => setFP('abandon', t)} placeholder="Oui / Non" />
            <Input label="Arrêt / retrait" value={formPf.arretRetrait ?? ''} onChangeText={(t) => setFP('arretRetrait', t)} placeholder="Oui / Non" />
            <Input label="Counseling PF post-partum" value={formPf.conseilPostpartum ?? ''} onChangeText={(t) => setFP('conseilPostpartum', t)} placeholder="Oui / Non" />
            <Input label="IST présente" value={formPf.istPresente ?? ''} onChangeText={(t) => setFP('istPresente', t)} placeholder="Oui / Non" />
            <Input label="Femme séropositive sous contraception" value={formPf.seropositive ?? ''} onChangeText={(t) => setFP('seropositive', t)} placeholder="Oui / Non" />
            <Input label="Observations" value={formPf.observations ?? ''} onChangeText={(t) => setFP('observations', t)} multiline />
            <View style={{ marginTop: 10 }}>
              <Btn title={pfEnEdition ? '💾 Corriger la consultation PF' : '💾 Enregistrer la consultation PF'} onPress={enregistrerPf} loading={saving} />
            </View>
            <SectionTitle>Consultations PF enregistrées</SectionTitle>
            {pfs.length === 0 ? <EtatVide texte="Aucune consultation." /> : null}
            {pfs.map((p: any) => (
              <View key={p.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitre}>{p.methode}</Text>
                  <Text style={styles.itemSous}>{p.date ? new Date(p.date).toLocaleDateString('fr-FR') : ''} · {p.nouvelleUtilisatrice ? 'Nouvelle' : 'Ancienne'}</Text>
                </View>
                <Btn title="✏️" small variant="outline" onPress={() => { setPfEnEdition(p); initFormPf() }} />
              </View>
            ))}
          </Card>
        ) : null}

        {/* ── Ordonnance ── */}
        {ongletT === 'ordonnance' ? (
          <Card>
            <SectionTitle>Prescription de médicaments</SectionTitle>
            {!consultation ? (
              <Btn title="Ouvrir la consultation" onPress={assurerConsultation} />
            ) : (
              <>
                {(consultation.medicaments ?? []).length === 0 ? <EtatVide texte="Aucun médicament prescrit." /> : null}
                {(consultation.medicaments ?? []).map((m: any) => (
                  <View key={m.id} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitre}>{m.nom}</Text>
                      <Text style={styles.itemSous}>{m.posologie ?? '—'} · {m.quantite ?? '—'} · {m.duree ?? '—'}</Text>
                    </View>
                    <Btn title="✕" small variant="danger" onPress={() => retirerMedicament(m)} />
                  </View>
                ))}
                <Btn title="＋ Ajouter un médicament" small variant="outline" onPress={() => setModaleMed(true)} />
              </>
            )}
          </Card>
        ) : null}

        {/* ── Examens ── */}
        {ongletT === 'examens' ? (
          <Card>
            <SectionTitle>Prescription d'examens</SectionTitle>
            {!consultation ? (
              <Btn title="Ouvrir la consultation" onPress={assurerConsultation} />
            ) : (
              <>
                <Input label="Examen du catalogue">
                  <ListeSelect
                    value={examenId}
                    options={optionsExamens}
                    placeholder="— Choisir un examen —"
                    onChange={(v) => setExamenId(v as number)}
                  />
                </Input>
                <Btn title="Prescrire l'examen du catalogue" small onPress={ajouterExamen} loading={saving} />
                <Input label="Examen hors clinique (saisie libre)" value={examenLibre} onChangeText={setExamenLibre} />
                <Btn title="Ajouter l'examen libre" small variant="outline" onPress={ajouterExamenLibre} loading={saving} />
                <SectionTitle>Examens prescrits</SectionTitle>
                {examensPrescrits.length === 0 ? <EtatVide texte="Aucun examen prescrit." /> : null}
                {examensPrescrits.map((e: any) => (
                  <View key={e.id} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitre}>{e.libelle}</Text>
                      <Badge label={e.statut === 'PAYEE' ? 'Payé' : 'En attente de paiement'} tone={e.statut === 'PAYEE' ? 'success' : 'muted'} />
                    </View>
                    {e.statut !== 'PAYEE' ? <Btn title="✕" small variant="danger" onPress={() => retirerExamen(e)} /> : null}
                  </View>
                ))}
              </>
            )}
          </Card>
        ) : null}
      </ScrollView>

      {/* Modale ajout médicament */}
      <Modale
        visible={modaleMed}
        titre="＋ Ajouter un médicament"
        onFermer={() => setModaleMed(false)}
        actions={
          <>
            <Btn title="Annuler" small variant="outline" onPress={() => setModaleMed(false)} />
            <Btn title="＋ Ajouter" small onPress={ajouterMedicament} loading={saving} />
          </>
        }
      >
        <Input label="Médicament du catalogue">
          <ListeSelect
            value={medId}
            options={medicaments.map((m) => ({ value: m.id, label: m.nom }))}
            placeholder="— Choisir —"
            onChange={(v) => {
              setMedId(v as number)
              const m = medicaments.find((x) => x.id === v)
              if (m) setMedNom(m.nom)
            }}
          />
        </Input>
        <Input label="Nom (saisie libre)" value={medNom} onChangeText={setMedNom} />
        <Input label="Posologie" value={medPoso} onChangeText={setMedPoso} placeholder="Ex : 1 comprimé matin et soir" />
        <Input label="Quantité" value={medQte} onChangeText={setMedQte} />
        <Input label="Durée" value={medDuree} onChangeText={setMedDuree} placeholder="Ex : 5 jours" />
      </Modale>

      {/* Modale : accouchement en urgence */}
      <Modale
        visible={urgenceVisible}
        titre="🚑 Accouchement en urgence"
        sousTitre="La patiente est prise en charge sans paiement — encaissé à la caisse après l'accouchement."
        onFermer={() => setUrgenceVisible(false)}
        actions={
          <>
            <Btn title="Annuler" small variant="outline" onPress={() => setUrgenceVisible(false)} />
            <Btn
              title="🚑 Créer et ouvrir l'accouchement"
              small
              onPress={creerUrgence}
              loading={urgenceEnCours}
            />
          </>
        }
      >
        <Input label="Patiente existante (recherche)" value={urgenceRecherche} onChangeText={setUrgenceRecherche} placeholder="Nom, prénom ou code…" />
        {urgenceResultats.length > 0 && !urgencePatiente ? (
          <View style={{ marginTop: 4 }}>
            {urgenceResultats.map((pa) => (
              <TouchableOpacity
                key={pa.id}
                style={styles.item}
                onPress={() => {
                  setUrgencePatiente(pa)
                  setUrgenceResultats([])
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitre}>{pa.nom} {pa.prenom}</Text>
                  <Text style={styles.itemSous}>code {pa.code} · {pa.age ?? '—'} ans</Text>
                </View>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>Choisir</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {urgencePatiente ? (
          <View style={[styles.item, { marginTop: 6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitre}>✓ {urgencePatiente.nom} {urgencePatiente.prenom}</Text>
              <Text style={styles.itemSous}>code {urgencePatiente.code}</Text>
            </View>
            <Btn
              title="✕ Nouvelle patiente"
              small
              variant="outline"
              onPress={() => {
                setUrgencePatiente(null)
                setUrgenceRecherche('')
              }}
            />
          </View>
        ) : (
          <>
            <SectionTitle>Ou nouvelle patiente</SectionTitle>
            <Input label="Nom *" value={urgenceForm.nom} onChangeText={(t) => setUrgenceForm((f) => ({ ...f, nom: t }))} />
            <Input label="Prénom(s) *" value={urgenceForm.prenom} onChangeText={(t) => setUrgenceForm((f) => ({ ...f, prenom: t }))} />
            <Input label="Âge" value={urgenceForm.age} onChangeText={(t) => setUrgenceForm((f) => ({ ...f, age: t }))} keyboardType="numeric" />
            <Input label="Téléphone" value={urgenceForm.telephone} onChangeText={(t) => setUrgenceForm((f) => ({ ...f, telephone: t }))} keyboardType="phone-pad" />
          </>
        )}
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
  sousTitre: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  actionsLigne: { flexDirection: 'row', gap: 8, marginBottom: 6 },
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
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 14 },
})
