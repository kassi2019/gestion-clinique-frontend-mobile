import React, { useEffect, useMemo, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  Alert,
  FlatList,
  Image,
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
import ListeCombo from '../components/ListeCombo'
import ReferenceFicheMobile from '../components/ReferenceFicheMobile'
import {
  UNITES_SOIN,
  VOIES_SOIN,
  libelleStatutSoin,
  quantiteSuggeree,
  texteLigneSoin,
  toneStatutSoin,
} from '../utils/soins'

type PassageRef = {
  id: number
  numeroOrdre: string
  statut: string
  consultable: boolean
  patient: { nom: string; prenom: string; code?: string; age?: string; sexe?: string }
  service?: { nom: string }
}

function aujourdhui(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

/** Traitement antérieur : Oui / Non + commentaire dans un seul champ texte (« NON », le commentaire, ou « OUI »). */
function traitementAnterieurChoix(texte?: string | null): boolean | null {
  const t = (texte ?? '').trim()
  if (!t) return null
  return t.toUpperCase() !== 'NON'
}
/** Médicaments, durée et dose rangés dans le même champ : « X ; Durée : Y ; Dose : Z ». */
function traitementAnterieurDetails(texte?: string | null) {
  const t = (texte ?? '').trim()
  const details = { medicaments: '', duree: '', dose: '' }
  if (!t || ['OUI', 'NON'].includes(t.toUpperCase())) return details
  const morceaux = t.split(/(?:^|\s*;\s*)(DUR[ÉE]E|DOSE)\s*:\s*/i)
  details.medicaments = morceaux[0].trim()
  for (let i = 1; i < morceaux.length; i += 2) {
    const cle = morceaux[i].toUpperCase().startsWith('DOSE') ? 'dose' : 'duree'
    details[cle] = (morceaux[i + 1] ?? '').trim()
  }
  return details
}
/** Antécédents chirurgicaux : « TYPE ; Durée / année : X » dans un seul champ texte. */
function chirurgieDetails(texte?: string | null) {
  const morceaux = (texte ?? '').trim().split(/(?:^|\s*;\s*)DUR[ÉE]E\s*\/\s*ANN[ÉE]E\s*:\s*/i)
  return { type: (morceaux[0] ?? '').trim(), annee: (morceaux[1] ?? '').trim() }
}
function chirurgieTexte(f: any): string {
  const annee = (f.chirurgieAnnee ?? '').trim()
  return [(f.chirurgieType ?? '').trim(), annee && `Durée / année : ${annee}`].filter(Boolean).join(' ; ')
}
function traitementAnterieurTexte(choix: boolean | null | undefined, f: any): string | null {
  if (choix === false) return 'NON'
  const duree = (f.traitementDuree ?? '').trim()
  const dose = (f.traitementDose ?? '').trim()
  const texte = [(f.traitementMedicaments ?? '').trim(), duree && `Durée : ${duree}`, dose && `Dose : ${dose}`]
    .filter(Boolean)
    .join(' ; ')
  if (choix === true) return texte || 'OUI'
  return texte || null
}

/** « Autres examens » : plusieurs valeurs dans un seul champ texte « A ; B ; C ». */
function separerExamens(texte?: string | null): string[] {
  return (texte ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
}

export default function ConsultationScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1
  const estMedecin = user?.role?.code === 'MEDECIN'

  // ── Flux médecin : affectation + disponibilité + heartbeat ──
  const [vueMedecin, setVueMedecin] = useState<'file' | 'terminees' | 'recherche'>('file')
  const [fileMedecin, setFileMedecin] = useState<{ enAttente: any[]; terminees: any[] }>({
    enAttente: [],
    terminees: [],
  })
  const [disponibilite, setDisponibilite] = useState<'DISPONIBLE' | 'INDISPONIBLE' | null>(null)
  const [affectationOuverteId, setAffectationOuverteId] = useState<number | null>(null)
  const [chargementFile, setChargementFile] = useState(false)

  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [passage, setPassage] = useState<PassageRef | null>(null)
  const [detail, setDetail] = useState<any>(null)
  /** Patient de sexe masculin : la DDR et « Grossesse en cours » sont masquées. */
  const patientMasculin = (detail?.passage?.patient?.sexe ?? passage?.patient?.sexe) === 'M'
  const [onglet, setOnglet] = useState<'fiche' | 'medicaments' | 'soins' | 'examens' | 'reference' | 'certificat'>('fiche')

  useEffect(() => {
    if (onglet === 'certificat') initCertificat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet])

  // Fiche
  const [fiche, setFiche] = useState<any>({})
  /** Listes paramétrées de la fiche (diagnostic, pathologie, nationalité, résidence, posologie, profession). */
  const [listes, setListes] = useState<Record<string, { value: string; label: string }[]>>({})
  const [saving, setSaving] = useState(false)

  // Médicaments
  const [medicaments, setMedicaments] = useState<any[]>([])
  const [prestations, setPrestations] = useState<any[]>([])
  const [modaleMed, setModaleMed] = useState(false)
  const [medForm, setMedForm] = useState({ medicamentId: null as number | null, nom: '', posologie: '', quantite: '', duree: '' })
  const [medEnCours, setMedEnCours] = useState(false)

  // ── Prescription intégrée à la fiche (en plus de l'onglet Médicaments) ──
  const [ficheMedId, setFicheMedId] = useState<number | null>(null)
  const [ficheMedNom, setFicheMedNom] = useState('')
  const [ficheMedPoso, setFicheMedPoso] = useState('')
  const [ficheMedQte, setFicheMedQte] = useState('')
  const [ficheMedDuree, setFicheMedDuree] = useState('')
  const [ficheMedEnCours, setFicheMedEnCours] = useState(false)

  /** « Posologie : … · Quantité à acheter : 2 plaquettes · Durée : … » */
  function detailPrescription(p: any) {
    const t = String(p.quantite ?? '').trim()
    const pluriel = Number(t) > 1
    const unite = p.medicament?.uniteVente === 'PLAQUE' ? (pluriel ? 'plaquettes' : 'plaquette') : pluriel ? 'boîtes' : 'boîte'
    const qte = /^\d+$/.test(t) && p.medicament ? `${t} ${unite}` : t
    return (
      [
        p.posologie && `Posologie : ${p.posologie}`,
        qte && `Quantité à acheter : ${qte}`,
        p.duree && `Durée : ${p.duree}`,
      ]
        .filter(Boolean)
        .join(' · ') || '—'
    )
  }

  /** Quantité à acheter : nombre entier ≥ 1 (boîtes ou plaquettes). */
  const quantiteValide = (q: string) => /^\d+$/.test(q.trim()) && Number(q) >= 1
  /** Unité de vente du médicament choisi (« plaquettes », « boîtes »). */
  function uniteDuMedicament(id: number | null) {
    const m = medicaments.find((x: any) => x.id === id && x.uniteVente)
    if (!m) return 'boîtes ou plaquettes'
    return m.uniteVente === 'PLAQUE' ? 'plaquettes' : 'boîtes'
  }

  async function ajouterMedicamentFiche() {
    if (!consultation) return
    if (!ficheMedId && !ficheMedNom.trim()) {
      Alert.alert('Médicament', 'Choisissez un médicament du catalogue ou saisissez un nom.')
      return
    }
    if (!ficheMedPoso.trim()) {
      Alert.alert('Médicament', 'Indiquez la posologie.')
      return
    }
    if (!quantiteValide(ficheMedQte)) {
      Alert.alert('Médicament', 'Indiquez la quantité à acheter (nombre de boîtes ou de plaquettes).')
      return
    }
    setFicheMedEnCours(true)
    try {
      await http.post(`/consultations/${consultation.id}/medicaments`, {
        medicamentId: ficheMedId ?? undefined,
        nom: ficheMedNom.trim() || undefined,
        posologie: ficheMedPoso || undefined,
        quantite: ficheMedQte.trim(),
        duree: ficheMedDuree || undefined,
      })
      alimenterListe('POSOLOGIE', ficheMedPoso)
      setFicheMedId(null)
      setFicheMedNom('')
      setFicheMedPoso('')
      setFicheMedQte('')
      setFicheMedDuree('')
      Alert.alert('✅ Médicament ajouté à la prescription')
      await chargerDetail(passage!.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Ajout impossible.')
    } finally {
      setFicheMedEnCours(false)
    }
  }

  // Examens
  const [nouvelExamenId, setNouvelExamenId] = useState<number | null>(null)
  const [nouvelExamenLaboId, setNouvelExamenLaboId] = useState<number | null>(null)
  const [nouvelExamenImagerieId, setNouvelExamenImagerieId] = useState<number | null>(null)
  const [nouvelExamenLibre, setNouvelExamenLibre] = useState('')
  const [examenEnCours, setExamenEnCours] = useState(false)

  // Lits libres (hospitalisation)
  const [lits, setLits] = useState<any[]>([])

  // Impression ordonnance
  const [ordoApercu, setOrdoApercu] = useState<string | null>(null)

  const consultation = detail?.passage?.consultation ?? null

  // ── Certificat d'arrêt ──
  const [formCert, setFormCert] = useState<any>({})
  const [certs, setCerts] = useState<any[]>([])
  const [savingCert, setSavingCert] = useState(false)

  function initCertificat() {
    const pat = detail?.passage?.patient
    const personnel = user?.personnel
    const aujourdHui = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const fin = new Date(aujourdHui)
    fin.setDate(fin.getDate() + 6)
    setFormCert({
      civilite: pat?.sexe === 'M' ? 'M.' : 'Mme',
      nomPatient: pat ? `${pat.nom} ${pat.prenom}` : '',
      // Comme le modèle : « Né(e) le ». Âge seul → date déduite (même règle qu'à l'Accueil)
      dateNaissance: pat?.dateNaissance
        ? String(pat.dateNaissance).slice(0, 10)
        : (() => {
            const n = parseInt(String(pat?.age ?? ''), 10)
            if (isNaN(n) || n < 0 || n > 150) return ''
            const d = new Date()
            d.setFullYear(d.getFullYear() - n)
            return d.toISOString().slice(0, 10)
          })(),
      profession: pat?.profession ?? '',
      dureeJours: '7',
      debut: iso(aujourdHui),
      fin: iso(fin),
      medecin: personnel ? `Dr ${personnel.nom} ${personnel.prenom}` : '',
      lieu: 'Bloléquin', // lieu du modèle officiel du certificat
    })
    chargerCertificats()
  }

  async function chargerCertificats() {
    if (!consultation) return
    try {
      const { data } = await http.get(`/consultations/${consultation.id}/certificats-arret`)
      setCerts(data ?? [])
    } catch {
      setCerts([])
    }
  }

  async function enregistrerCertificat() {
    if (!consultation) {
      Alert.alert('Certificat', 'Enregistrez d’abord la fiche de consultation.')
      return
    }
    setSavingCert(true)
    try {
      await http.post(`/consultations/${consultation.id}/certificat-arret`, {
        civilite: formCert.civilite || 'Mme',
        nomPatient: formCert.nomPatient || detail?.passage?.patient?.nom || '',
        dateNaissance: formCert.dateNaissance || undefined,
        profession: formCert.profession || undefined,
        dureeJours: Number(formCert.dureeJours) || 1,
        debut: formCert.debut,
        fin: formCert.fin,
        medecin: formCert.medecin,
        lieu: formCert.lieu || undefined,
      })
      Alert.alert('✅ Certificat enregistré', 'Il est imprimable depuis la version web (onglet Certificat d’arrêt).')
      chargerCertificats()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setSavingCert(false)
    }
  }
  const historique = detail?.historique ?? []
  const estInterne = passage?.statut !== 'EXTERNE' && detail?.passage?.typePatient !== 'EXTERNE'

  // IMC calculé automatiquement à partir des constantes de l'accueil
  // (taille en cm côté accueil → conversion en mètres).
  const poidsKg = Number(detail?.passage?.poids)
  const tailleSaisie = Number(String(detail?.passage?.taille ?? '').replace(',', '.'))
  // Taille en cm (165) ou déjà en m (1,65)
  const tailleM = tailleSaisie > 3 ? tailleSaisie / 100 : tailleSaisie
  const imcCalcule = poidsKg && tailleM ? (poidsKg / Math.pow(tailleM, 2)).toFixed(1) : ''

  /** Prix affiché sur l'ordonnance (tests automatiques), ex. 1 500. */
  const formatPrix = (v: any) => String(Math.round(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  /** Tests cochés qui seront inscrits sur l'ordonnance (règle du serveur). */
  const faitTest = (v: any) => ['positif', 'négatif'].includes(String(v ?? '').toLowerCase())
  const testsOrdonnance = [
    faitTest(fiche.tdrPaludisme) ? 'Test de diagnostic rapide' : null,
    fiche.cdipRealise === true ? 'Test de VIH' : null,
    String(fiche.tauxHemoglobine ?? '').trim() ? "Taux d'hémoglobine" : null,
    faitTest(fiche.testSyphilis) ? 'Test de syphilis' : null,
    faitTest(fiche.testHepatite) ? "Test d'hépatite" : null,
  ].filter(Boolean) as string[]

  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setResultats([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await http.get('/consultations/recherche', {
          params: { code: q, cliniqueId },
        })
        setResultats(data)
      } catch {
        setResultats([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [recherche])

  useEffect(() => {
    ;(async () => {
      try {
        const [p, m, l] = await Promise.all([
          http.get('/prestations', { params: { perPage: 0, cliniqueId } }),
          http.get('/medicaments', { params: { perPage: 0, cliniqueId } }),
          http.get('/hospitalisation/lits', { params: { cliniqueId } }),
        ])
        setPrestations(p.data.data ?? [])
        setMedicaments(m.data.data ?? [])
        setLits((l.data ?? []).filter((x: any) => x.actif && !x.occupe))
      } catch {
        /* vide */
      }
    })()
  }, [])

  async function choisirPassage(p: PassageRef) {
    if (p.consultable === false) {
      Alert.alert(
        'Passage non activé',
        "Le patient doit d'abord payer sa consultation à la caisse avant de consulter.",
      )
      return
    }
    setPassage(p)
    setResultats([])
    setOnglet('fiche')
    await chargerDetail(p.id)
  }

  // ── Flux médecin : file d'attente / disponibilité ──
  async function chargerFileMedecin(silencieux = false) {
    if (!estMedecin) return
    if (!silencieux) setChargementFile(true)
    try {
      const { data } = await http.get('/consultations/moi', { params: { jour: aujourdhui() } })
      setDisponibilite(data.disponibilite ?? null)
      setFileMedecin({ enAttente: data.enAttente ?? [], terminees: data.terminees ?? [] })
    } catch {
      /* file vide */
    } finally {
      setChargementFile(false)
    }
  }

  // Heartbeat : un médecin DISPONIBLE qui ne ping plus (> 2 min) est
  // considéré « poste éteint » par le backend et ne reçoit plus de patients.
  useEffect(() => {
    if (!estMedecin) return
    const ping = () => http.post('/consultations/ping').catch(() => {})
    ping()
    const timer = setInterval(ping, 60000)
    return () => clearInterval(timer)
  }, [estMedecin])

  useEffect(() => {
    if (!estMedecin || passage) return
    chargerFileMedecin()
    // Rafraîchissement automatique : les patients affectés après un paiement,
    // un crédit ou un cas social apparaissent sans quitter l'écran.
    const timer = setInterval(() => chargerFileMedecin(true), 30000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estMedecin, passage])

  async function basculerDisponibilite() {
    const cible = disponibilite === 'DISPONIBLE' ? 'INDISPONIBLE' : 'DISPONIBLE'
    try {
      await http.put('/consultations/disponibilite', { disponibilite: cible })
      setDisponibilite(cible)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Opération impossible.')
    }
  }

  async function ouvrirAffectation(a: any, avecOuverture: boolean) {
    setAffectationOuverteId(a.id)
    if (avecOuverture) {
      try {
        await http.post(`/consultations/affectations/${a.id}/ouvrir`)
      } catch {
        /* tolérant : le dossier s'ouvre quand même */
      }
    }
    const p: PassageRef = a.passage
    setPassage(p)
    setOnglet('fiche')
    await chargerDetail(p.id)
  }

  /** Quitter le dossier sans valider : EN_CONSULTATION → EN_ATTENTE. */
  async function fermerAffectation() {
    if (affectationOuverteId == null) return
    const id = affectationOuverteId
    setAffectationOuverteId(null)
    try {
      await http.post(`/consultations/affectations/${id}/fermer`)
    } catch {
      /* fire-and-forget */
    }
    chargerFileMedecin()
  }

  function fermerPassage() {
    setPassage(null)
    setDetail(null)
    setOrdoApercu(null)
    if (estMedecin) fermerAffectation()
  }

  async function chargerDetail(passageId: number) {
    try {
      const { data } = await http.get(`/consultations/passages/${passageId}`)
      setDetail(data)
      const c = data.passage.consultation
      const pc = data.passage.patient ?? {}
      if (c) {
        setFiche({
          motif: c.motif ?? '',
          observation: c.observation ?? '',
          diagnostic: c.diagnostic ?? '',
          modeEntree: c.modeEntree ?? '',
          modeEntreeAutre: c.modeEntreeAutre ?? '',
          hta: c.hta, diabete: c.diabete, tabac: c.tabac, alcool: c.alcool,
          grossesseEnCours: c.grossesseEnCours,
          ddr: c.ddr ?? '',
          // Oui / Non déduit du texte enregistré (« NON », « OUI » ou le commentaire)
          traitementAnterieurOuiNon: traitementAnterieurChoix(c.traitementAnterieur),
          traitementMedicaments: traitementAnterieurDetails(c.traitementAnterieur).medicaments,
          traitementDuree: traitementAnterieurDetails(c.traitementAnterieur).duree,
          traitementDose: traitementAnterieurDetails(c.traitementAnterieur).dose,
          antecedentsMedicaux: c.antecedentsMedicaux ?? '',
          chirurgieType: chirurgieDetails(c.antecedentsChirurgicaux).type,
          chirurgieAnnee: chirurgieDetails(c.antecedentsChirurgicaux).annee,
          pathologiesAssociees: c.pathologiesAssociees ?? '',
          typeSuivi: c.typeSuivi ?? '',
          consultantType: c.consultantType ?? '',
          imc: c.imc ?? '',
          zscore: c.zscore ?? '',
          frequenceRespiratoire: c.frequenceRespiratoire ?? '',
          perimetreBrachial: c.perimetreBrachial || data.passage.perimetreBrachial || '',
          perimetreCranien: c.perimetreCranien || data.passage.perimetreCranien || '',
          rechercheTB: c.rechercheTB,
          tdrPaludisme: c.tdrPaludisme,
          goutteEpaisse: c.goutteEpaisse,
          mildaEligible: c.mildaEligible,
          mildaRemise: c.mildaRemise,
          cdipPropose: c.cdipPropose,
          cdipRealise: c.cdipRealise,
          codeDepistage: c.codeDepistage ?? '',
          glycemieAjeun: c.glycemieAjeun ?? '',
          glycemieNonAjeun: c.glycemieNonAjeun ?? '',
          tauxHemoglobine: c.tauxHemoglobine ?? '',
          testSyphilis: c.testSyphilis ?? '',
          testHepatite: c.testHepatite ?? '',
          autresExamens: c.autresExamens ?? '',
          casPresumeTB: c.casPresumeTB,
          moDureeHeures: c.moDureeHeures ?? '',
          moDureeMinutes: c.moDureeMinutes ?? '',
          moDebut: c.moDebut ?? '',
          moFin: c.moFin ?? '',
          profession: pc.profession ?? '',
          nationalite: pc.nationalite ?? '',
          scolarisation: pc.scolarisation ?? '',
          statutConjugal: pc.statutConjugal ?? '',
          typePopulation: pc.typePopulation ?? '',
          populationsRisque: pc.populationsRisque ?? '',
          protectionSociale: pc.protectionSociale ?? '',
          residenceHabituelle: pc.residenceHabituelle ?? pc.ville ?? '',
          residenceActuelle: pc.residenceActuelle ?? '',
          hospitalisation: c.hospitalisation ?? false,
          chirurgie: c.chirurgie ?? (c.antecedentsChirurgicaux ? true : null),
          prescriptionMedicaments: c.prescriptionMedicaments ?? ((c.medicaments ?? []).length > 0 ? true : null),
          hospitalisationDuree: c.hospitalisationDuree ?? '',
          issueSortie: c.issueSortie || (c.hospitalisation ? 'HOSPITALISE' : ''),
          conduiteTenir: c.conduiteTenir ?? '',
        })
      } else {
        setFiche({})
      }
      setMedicaments(data.passage.consultation?.medicaments ?? [])
    } catch {
      Alert.alert('Consultation', 'Impossible de charger le passage.')
    }
  }

  // ── Listes paramétrées : saisie libre auto-alimentée (endpoints dédiés) ──
  const ROUTES_LISTES: Record<string, string> = {
    DIAGNOSTIC: '/diagnostics',
    PATHOLOGIE: '/pathologies',
    NATIONALITE: '/nationalites',
    RESIDENCE: '/residences',
    POSOLOGIE: '/posologies',
    PROFESSION: '/professions',
    MOTIF: '/motifs',
    ANTECEDENT: '/antecedents-medicaux',
    EXAMEN: '/autres-examens',
    INTERVENTION: '/interventions-chirurgicales',
  }

  async function chargerListes() {
    try {
      const codes = Object.keys(ROUTES_LISTES)
      // allSettled : une liste indisponible ne vide pas toutes les autres
      const reps = await Promise.allSettled(codes.map((c) => http.get(ROUTES_LISTES[c], { params: { cliniqueId } })))
      const out: Record<string, { value: string; label: string }[]> = {}
      codes.forEach((c, i) => {
        const r = reps[i]
        out[c.toLowerCase()] = r.status === 'fulfilled'
          ? ((r.value.data ?? []) as any[]).map((x) => ({ value: x.libelle, label: x.libelle }))
          : []
      })
      setListes(out)
    } catch {
      /* listes vides */
    }
  }

  useEffect(() => {
    chargerListes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function alimenterListe(code: string, libelle?: string) {
    if (!libelle?.trim() || !ROUTES_LISTES[code]) return
    try {
      await http.post(ROUTES_LISTES[code], { cliniqueId, libelle: libelle.trim() })
    } catch {
      /* facultatif */
    }
  }

  // ── Fiche ──
  async function enregistrerFiche() {
    if (!passage) return
    setSaving(true)
    try {
      const vider = (x: any) => (x === '' || x === null ? undefined : x)
      const payload = {
        motif: vider(fiche.motif),
        observation: vider(fiche.observation),
        diagnostic: vider(fiche.diagnostic),
        modeEntree: vider(fiche.modeEntree),
        modeEntreeAutre: vider(fiche.modeEntreeAutre),
        hta: fiche.hta,
        diabete: fiche.diabete,
        tabac: fiche.tabac,
        alcool: fiche.alcool,
        // Patient masculin : ces deux informations ne sont pas enregistrées
        grossesseEnCours: patientMasculin ? null : fiche.grossesseEnCours,
        ddr: patientMasculin ? null : vider(fiche.ddr),
        traitementAnterieur: traitementAnterieurTexte(fiche.traitementAnterieurOuiNon, fiche),
        antecedentsMedicaux: vider(fiche.antecedentsMedicaux),
        antecedentsChirurgicaux: fiche.chirurgie === false ? null : vider(chirurgieTexte(fiche)),
        pathologiesAssociees: vider(fiche.pathologiesAssociees),
        typeSuivi: vider(fiche.typeSuivi),
        consultantType: vider(fiche.consultantType),
        imc: imcCalcule || undefined,
        zscore: vider(fiche.zscore),
        frequenceRespiratoire: vider(fiche.frequenceRespiratoire),
        perimetreBrachial: vider(fiche.perimetreBrachial),
        perimetreCranien: vider(fiche.perimetreCranien),
        rechercheTB: fiche.rechercheTB,
        tdrPaludisme: fiche.tdrPaludisme,
        goutteEpaisse: fiche.goutteEpaisse,
        mildaEligible: fiche.mildaEligible,
        mildaRemise: fiche.mildaRemise,
        cdipPropose: fiche.cdipPropose,
        cdipRealise: fiche.cdipRealise,
        codeDepistage: vider(fiche.codeDepistage),
        glycemieAjeun: vider(fiche.glycemieAjeun),
        glycemieNonAjeun: vider(fiche.glycemieNonAjeun),
        tauxHemoglobine: vider(fiche.tauxHemoglobine),
        testSyphilis: vider(fiche.testSyphilis),
        testHepatite: vider(fiche.testHepatite),
        autresExamens: vider(fiche.autresExamens),
        casPresumeTB: fiche.casPresumeTB,
        moDureeHeures: vider(fiche.moDureeHeures),
        moDureeMinutes: vider(fiche.moDureeMinutes),
        moDebut: vider(fiche.moDebut),
        moFin: vider(fiche.moFin),
        // Hospitalisation = issue « Hospitalisé(e) » (une seule issue à la fois)
        hospitalisation: fiche.issueSortie === 'HOSPITALISE',
        chirurgie: fiche.chirurgie ?? undefined,
        prescriptionMedicaments: fiche.prescriptionMedicaments ?? undefined,
        hospitalisationDuree: vider(fiche.hospitalisationDuree),
        typeHospitalisation: vider(fiche.typeHospitalisation),
        hospitalisationDureeJours: fiche.hospitalisationDureeJours ?? undefined,
        litId: ['HOSPITALISE', 'MO'].includes(fiche.issueSortie) ? fiche.litId ?? undefined : null,
        issueSortie: vider(fiche.issueSortie),
        conduiteTenir: vider(fiche.conduiteTenir),
        patient: {
          profession: vider(fiche.profession),
          nationalite: vider(fiche.nationalite),
          scolarisation: vider(fiche.scolarisation),
          statutConjugal: vider(fiche.statutConjugal),
          typePopulation: vider(fiche.typePopulation),
          populationsRisque: vider(fiche.populationsRisque),
          protectionSociale: vider(fiche.protectionSociale),
          residenceHabituelle: vider(fiche.residenceHabituelle),
          residenceActuelle: vider(fiche.residenceActuelle),
        },
      }
      await http.post(`/consultations/passages/${passage.id}`, payload)
      Alert.alert('✅ Fiche enregistrée')
      // Saisie libre auto-alimentée : enrichit les listes paramétrées
      alimenterListe('DIAGNOSTIC', fiche.diagnostic)
      alimenterListe('PATHOLOGIE', fiche.pathologiesAssociees)
      alimenterListe('NATIONALITE', fiche.nationalite)
      alimenterListe('RESIDENCE', fiche.residenceActuelle)
      alimenterListe('RESIDENCE', fiche.residenceHabituelle)
      alimenterListe('PROFESSION', fiche.profession)
      alimenterListe('MOTIF', fiche.motif)
      alimenterListe('ANTECEDENT', fiche.antecedentsMedicaux)
      if (fiche.chirurgie === true) alimenterListe('INTERVENTION', fiche.chirurgieType)
      separerExamens(fiche.autresExamens).forEach((ex) => alimenterListe('EXAMEN', ex))
      await chargerDetail(passage.id)
      chargerListes()
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function validerConsultation() {
    if (!consultation) return
    Alert.alert('Valider la consultation ?', 'Les données seront horodatées et tracées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Valider',
          onPress: async () => {
          try {
            await http.post(`/consultations/${consultation.id}/valider`)
            Alert.alert('✅ Consultation validée')
            setAffectationOuverteId(null) // le backend clôt l'affectation (TERMINE)
            await chargerDetail(passage!.id)
            chargerFileMedecin()
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Validation impossible.')
          }
        },
      },
    ])
  }

  // ── Médicaments ──
  const optionsMedicaments = useMemo(() => {
    const dispo = medicaments
      .filter((m) => m.stock > 0)
      .map((m) => ({ value: m.id, label: `${m.nom} (stock ${m.stock})` }))
    const rupture = medicaments
      .filter((m) => m.stock <= 0)
      .map((m) => ({ value: m.id, label: `${m.nom} (rupture)` }))
    return estInterne ? dispo : [...dispo, ...rupture]
  }, [medicaments, estInterne])

  async function ajouterMedicament() {
    if (!consultation) return
    if (!medForm.medicamentId && !medForm.nom.trim()) {
      Alert.alert('Médicament', 'Choisissez un médicament du catalogue ou saisissez un nom libre.')
      return
    }
    if (!medForm.posologie.trim()) {
      Alert.alert('Médicament', 'Indiquez la posologie.')
      return
    }
    if (!quantiteValide(medForm.quantite)) {
      Alert.alert('Médicament', 'Indiquez la quantité à acheter (nombre de boîtes ou de plaquettes).')
      return
    }
    setMedEnCours(true)
    try {
      await http.post(`/consultations/${consultation.id}/medicaments`, {
        medicamentId: medForm.medicamentId ?? undefined,
        ordonnanceId: ordonnanceActive?.statut === 'EN_ATTENTE' ? ordonnanceActive.id : undefined,
        nom: medForm.nom.trim() || undefined,
        posologie: medForm.posologie || undefined,
        quantite: medForm.quantite.trim(),
        duree: medForm.duree || undefined,
      })
      Alert.alert('✅ Médicament prescrit')
      alimenterListe('POSOLOGIE', medForm.posologie)
      setMedForm({ medicamentId: null, nom: '', posologie: '', quantite: '', duree: '' })
      setModaleMed(false)
      await chargerDetail(passage!.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Prescription impossible.')
    } finally {
      setMedEnCours(false)
    }
  }

  async function retirerMedicament(id: number) {
    try {
      await http.delete(`/consultations/medicaments/${id}`)
      await chargerDetail(passage!.id)
    } catch {
      Alert.alert('Erreur', 'Retrait impossible.')
    }
  }

  // ── Onglet Soins : prescription → module Soins (sans caisse) ──
  type LigneSoinForm = {
    medicamentId: number | null
    dose: string
    unite: string
    voie: string | null
    posologie: string
    quantitePharmacie: string
    quantiteManuelle: boolean
  }
  const nouvelleLigneSoin = (total: number): LigneSoinForm => ({
    medicamentId: null,
    dose: '1',
    unite: '',
    voie: null,
    posologie: '',
    quantitePharmacie: String(total),
    quantiteManuelle: false,
  })
  const [modaleSoin, setModaleSoin] = useState(false)
  const [soinEnCours, setSoinEnCours] = useState(false)
  const [typesSoins, setTypesSoins] = useState<{ value: number; label: string }[]>([])
  const [consommables, setConsommables] = useState<{ value: number; label: string }[]>([])
  const [soinForm, setSoinForm] = useState({
    typeSoinId: null as number | null,
    foisParJour: '1',
    dureeJours: '1',
    instructions: '',
    lignes: [] as LigneSoinForm[],
  })
  const totalAdminSoin = Math.max(1, Number(soinForm.foisParJour) || 1) * Math.max(1, Number(soinForm.dureeJours) || 1)

  /** Quantité à retirer : dose × nombre d'administrations, tant qu'elle n'est pas saisie à la main. */
  function recalculerLignes(lignes: LigneSoinForm[], total: number) {
    return lignes.map((l) =>
      l.quantiteManuelle ? l : { ...l, quantitePharmacie: String(quantiteSuggeree(l.dose, total)) },
    )
  }
  function majRythmeSoin(champ: { foisParJour?: string; dureeJours?: string }) {
    const f = { ...soinForm, ...champ }
    const total = Math.max(1, Number(f.foisParJour) || 1) * Math.max(1, Number(f.dureeJours) || 1)
    setSoinForm({ ...f, lignes: recalculerLignes(f.lignes, total) })
  }
  function majLigneSoin(i: number, champ: Partial<LigneSoinForm>) {
    const lignes = soinForm.lignes.map((l, j) => (j === i ? { ...l, ...champ } : l))
    setSoinForm({ ...soinForm, lignes: champ.dose !== undefined ? recalculerLignes(lignes, totalAdminSoin) : lignes })
  }

  async function ouvrirSoin() {
    setSoinForm({ typeSoinId: null, foisParJour: '1', dureeJours: '1', instructions: '', lignes: [nouvelleLigneSoin(1)] })
    setModaleSoin(true)
    try {
      const [t, m] = await Promise.all([
        http.get('/types-soins', { params: { cliniqueId } }),
        http.get('/medicaments', { params: { perPage: 0, cliniqueId } }),
      ])
      setTypesSoins((t.data ?? []).map((x: any) => ({ value: x.id, label: x.libelle })))
      // Seuls les médicaments consommables disponibles en stock sont proposés
      const liste = Array.isArray(m.data) ? m.data : (m.data.data ?? [])
      setConsommables(
        liste
          .filter((x: any) => x.actif && x.consommable && x.stock > 0)
          .map((x: any) => ({
            value: x.id,
            label: `${x.nom}${x.dosage ? ' — ' + x.dosage : ''}${x.forme ? ' (' + x.forme + ')' : ''} · stock ${x.stock}`,
          })),
      )
    } catch {
      /* listes vides */
    }
  }

  async function confirmerSoin() {
    if (!consultation || !passage) return
    if (!soinForm.typeSoinId) {
      Alert.alert('Soin', 'Choisissez le type de soin.')
      return
    }
    if (soinForm.lignes.some((l) => !l.medicamentId)) {
      Alert.alert('Soin', "Choisissez le médicament de chaque ligne (ou retirez la ligne si le soin n'en demande pas).")
      return
    }
    setSoinEnCours(true)
    try {
      await http.post(`/consultations/${consultation.id}/soins`, {
        typeSoinId: soinForm.typeSoinId,
        foisParJour: Number(soinForm.foisParJour) || 1,
        dureeJours: Number(soinForm.dureeJours) || 1,
        instructions: soinForm.instructions.trim() || undefined,
        lignes: soinForm.lignes.map((l) => ({
          medicamentId: l.medicamentId,
          dose: l.dose.trim(),
          unite: l.unite || undefined,
          voie: l.voie || undefined,
          posologie: l.posologie || undefined,
          quantitePharmacie: Number(l.quantitePharmacie) || 1,
        })),
      })
      soinForm.lignes.forEach((l) => alimenterListe('POSOLOGIE', l.posologie))
      setModaleSoin(false)
      await chargerDetail(passage.id)
      Alert.alert('💉 Soin prescrit', 'Il est visible dans le module Soins.')
    } catch (e: any) {
      const m = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(m) ? m.join('\n') : m ?? 'Prescription du soin impossible.')
    } finally {
      setSoinEnCours(false)
    }
  }

  function retirerSoin(s: any) {
    Alert.alert('Retirer le soin', `Retirer le soin « ${s.typeSoin} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await http.delete(`/consultations/soins/${s.id}`)
            await chargerDetail(passage!.id)
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Retrait impossible.')
          }
        },
      },
    ])
  }

  function arreterSoin(s: any) {
    Alert.alert('Arrêter le soin', `Arrêter « ${s.typeSoin} » ? Les administrations restantes ne seront pas faites.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Arrêter',
        style: 'destructive',
        onPress: async () => {
          try {
            await http.post(`/consultations/soins/${s.id}/arreter`)
            await chargerDetail(passage!.id)
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Arrêt impossible.')
          }
        },
      },
    ])
  }

  async function imprimerOrdonnance() {
    if (!consultation) return
    try {
      const { data } = await http.post(`/impression/consultations/${consultation.id}`, null, {
        params: { ordonnanceId: ordonnanceActive?.id ?? undefined },
      })
      setOrdoApercu(data.contenu ?? 'Ordonnance imprimée au poste.')
      Alert.alert('🖨️ Ordonnance', data.ok ? 'Envoyée à l\'imprimante du poste.' : 'Impression non configurée — aperçu affiché.')
    } catch {
      Alert.alert('Erreur', 'Impression impossible.')
    }
  }

  // ── Examens (séparés : laboratoire / imagerie) ──
  const optionsExamens = useMemo(() => {
    const deja = new Set((detail?.passage?.prestations ?? []).map((l: any) => l.prestationId).filter(Boolean))
    return prestations
      .filter((p) => p.actif && p.type !== 'CONSULTATION' && !deja.has(p.id))
      .map((p) => ({ value: p.id, label: p.libelle, type: p.type }))
  }, [prestations, detail])

  const optionsExamensLabo = optionsExamens.filter((o: any) => o.type === 'EXAMEN_LABO')
  const optionsExamensImagerie = optionsExamens.filter((o: any) => o.type === 'IMAGERIE')

  /** Un examen est « déjà fait » si le service concerné l'a validé. */
  function estFait(l: any): boolean {
    const labo = (detail?.passage?.examensLabo ?? []).find((e: any) => e.passagePrestationId === l.id)
    const ima = (detail?.passage?.examensImagerie ?? []).find((e: any) => e.passagePrestationId === l.id)
    return labo?.statut === 'VALIDE' || ima?.statut === 'VALIDE'
  }

  // ── Résultats des examens (visibles par le médecin) ──
  const [resultatVisible, setResultatVisible] = useState(false)
  const [resultatCourant, setResultatCourant] = useState<{ type: 'LABO' | 'IMAGERIE'; exam: any; libelle?: string } | null>(null)

  /** Fiches d'échographie établies par l'imagerie pour ce passage. */
  const fichesPassage = (detail?.passage?.fiches ?? []) as any[]

  /** Détail d'une consultation passée (modale : ordonnance, examens, résultats). */
  const [histoDetail, setHistoDetail] = useState<any>(null)
  const [histoOnglet, setHistoOnglet] = useState<'consultation' | 'labo' | 'imagerie' | 'ordonnance' | 'externes'>('consultation')
  // Après un rechargement, le détail ouvert reprend les données à jour
  useEffect(() => {
    if (histoDetail) setHistoDetail((detail?.historique ?? []).find((h: any) => h.id === histoDetail.id) ?? histoDetail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  // ── Ordonnances multiples ──
  const [ordonnanceActiveId, setOrdonnanceActiveId] = useState<number | null>(null)
  const ordonnancesConsult: any[] = consultation?.ordonnances ?? []
  const ordonnanceActive = ordonnancesConsult.find((o) => o.id === ordonnanceActiveId) ?? null
  const medicamentsOrdonnance = (consultation?.medicaments ?? []).filter(
    (m: any) => !ordonnanceActive || m.ordonnanceId === ordonnanceActive.id,
  )
  useEffect(() => {
    if (!ordonnancesConsult.some((o) => o.id === ordonnanceActiveId)) {
      setOrdonnanceActiveId(ordonnancesConsult.length ? ordonnancesConsult[ordonnancesConsult.length - 1].id : null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultation])
  async function nouvelleOrdonnance() {
    if (!consultation || !passage) return
    try {
      const { data } = await http.post(`/consultations/${consultation.id}/ordonnances`)
      await chargerDetail(passage.id)
      setOrdonnanceActiveId(data.id)
      Alert.alert('💊 Nouvelle ordonnance', `Ordonnance ${data.numero} prête : ajoutez les médicaments.`)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? "Création de l'ordonnance impossible.")
    }
  }

  // ── Résultat d'un examen fait hors clinique (photo du document) ──
  const [ligneJoindre, setLigneJoindre] = useState<any>(null)
  const [formJoindre, setFormJoindre] = useState({ contenu: '', nomFichier: '', dateExamen: '', lieu: '', conclusion: '' })
  const [joindreEnCours, setJoindreEnCours] = useState(false)
  const [documentVu, setDocumentVu] = useState<any>(null)

  function ouvrirJoindre(l: any) {
    const r = l.resultatExterne
    setFormJoindre({
      contenu: '',
      nomFichier: '',
      dateExamen: r?.dateExamen ? String(r.dateExamen).slice(0, 10) : '',
      lieu: r?.lieu ?? '',
      conclusion: r?.conclusion ?? '',
    })
    setLigneJoindre(l)
  }
  async function choisirPhoto(source: 'camera' | 'galerie') {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Appareil photo', "L'accès à l'appareil photo a été refusé.")
        return
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.6 }
    const r = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
    if (r.canceled || !r.assets?.[0]?.base64) return
    const a = r.assets[0]
    if (((a.base64 ?? '').length * 3) / 4 > 7 * 1024 * 1024) {
      Alert.alert('Photo trop lourde', 'Reprenez la photo (7 Mo maximum).')
      return
    }
    setFormJoindre((f) => ({
      ...f,
      contenu: `data:image/jpeg;base64,${a.base64}`,
      nomFichier: a.fileName ?? `resultat-${Date.now()}.jpg`,
    }))
  }
  async function enregistrerJoindre() {
    if (!ligneJoindre) return
    if (!formJoindre.contenu && !ligneJoindre.resultatExterne) {
      Alert.alert('Résultat', 'Prenez une photo du résultat ou choisissez-la dans la galerie.')
      return
    }
    setJoindreEnCours(true)
    try {
      await http.post(`/consultations/examens/${ligneJoindre.id}/resultat-externe`, {
        nomFichier: formJoindre.nomFichier || undefined,
        contenu: formJoindre.contenu || undefined,
        dateExamen: formJoindre.dateExamen || undefined,
        lieu: formJoindre.lieu || undefined,
        conclusion: formJoindre.conclusion || undefined,
      })
      Alert.alert('✅ Résultat enregistré', `« ${ligneJoindre.libelle} » est joint au dossier.`)
      setLigneJoindre(null)
      if (passage) await chargerDetail(passage.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Enregistrement impossible.')
    } finally {
      setJoindreEnCours(false)
    }
  }
  async function voirDocument(ligneId: number, libelle: string) {
    try {
      const { data } = await http.get(`/consultations/examens/${ligneId}/resultat-externe`)
      setDocumentVu({ ...data, ligneId, libelle })
    } catch (e: any) {
      Alert.alert('Document', e.response?.data?.message ?? 'Document introuvable.')
    }
  }
  function supprimerDocument() {
    const doc = documentVu
    if (!doc) return
    Alert.alert('Supprimer le document ?', `Le résultat joint à « ${doc.libelle} » sera retiré du dossier.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui, supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await http.delete(`/consultations/examens/${doc.ligneId}/resultat-externe`)
            setDocumentVu(null)
            if (passage) await chargerDetail(passage.id)
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Suppression impossible.')
          }
        },
      },
    ])
  }

  // ── Historique : synthèse du dossier et examens de chaque passage ──
  const cleTexte = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
  const syntheseDossier = useMemo(() => {
    const liste: any[] = historique
    const cumuler = (valeurs: { libelle: string; date: string }[]) => {
      const vus = new Map<string, { libelle: string; date: string; nb: number }>()
      for (const v of valeurs) {
        const k = cleTexte(v.libelle)
        if (!k) continue
        const e = vus.get(k)
        if (e) e.nb += 1
        else vus.set(k, { ...v, nb: 1 })
      }
      return [...vus.values()]
    }
    const antecedents = new Map<string, string>()
    const noter = (t: string) => {
      const k = cleTexte(t)
      if (k && !antecedents.has(k)) antecedents.set(k, t)
    }
    for (const h of liste) {
      if (h.hta === true) noter('HTA')
      if (h.diabete === true) noter('Diabète')
      if (h.tabac === true) noter('Tabac')
      if (h.alcool === true) noter('Alcool')
      ;(h.antecedentsMedicaux ?? '').split(/[;,]/).forEach((a: string) => noter(a.trim()))
      if (h.antecedentsChirurgicaux?.trim()) noter(`Chirurgie : ${h.antecedentsChirurgicaux.trim()}`)
    }
    return {
      antecedents: [...antecedents.values()],
      diagnostics: cumuler(liste.filter((h) => h.diagnostic?.trim()).map((h) => ({ libelle: h.diagnostic.trim(), date: h.createdAt }))),
      pathologies: cumuler(
        liste.flatMap((h) =>
          (h.pathologiesAssociees ?? '')
            .split(/[;,]/)
            .map((x: string) => x.trim())
            .filter(Boolean)
            .map((libelle: string) => ({ libelle, date: h.createdAt })),
        ),
      ),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historique])
  const histoLignes: any[] = histoDetail?.passage?.prestations ?? []
  const realiseIci = (l: any) => !!(l.examenLabo || l.examenImagerie)
  const histoPrescrits = (type: string) =>
    histoLignes.filter((l) => l.prestation?.type === type && l.statut !== 'EXTERNE' && !realiseIci(l))
  const histoExternes = useMemo(() => {
    const lignes = histoLignes.filter((l) => l.statut === 'EXTERNE' || (l.statut === 'EN_ATTENTE' && !realiseIci(l)))
    const vides = ['RAS', 'NEANT', 'AUCUN', 'AUCUNE', 'NON', 'NA', '-', '/']
    const catalogue = prestations.filter((p: any) => ['EXAMEN_LABO', 'IMAGERIE'].includes(p.type)).map((p: any) => cleTexte(p.libelle))
    const demandes = separerExamens(histoDetail?.autresExamens)
      .filter((ex) => !vides.includes(cleTexte(ex)) && !catalogue.includes(cleTexte(ex)))
      .filter((ex) => !lignes.some((l) => cleTexte(l.libelle) === cleTexte(ex)))
      .map((ex) => ({ id: `demande-${ex}`, libelle: ex, resultatExterne: null, aCreer: true }))
    return [...lignes, ...demandes]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histoDetail, prestations])
  async function joindreDepuisHistorique(e: any) {
    if (!e.aCreer) return ouvrirJoindre(e)
    try {
      const { data } = await http.post(`/consultations/${histoDetail.id}/examens/ajouter`, { libelle: e.libelle })
      if (passage) await chargerDetail(passage.id)
      ouvrirJoindre({ id: data.id, libelle: data.libelle, resultatExterne: null })
    } catch (err: any) {
      Alert.alert('Erreur', err.response?.data?.message ?? "Impossible d'ajouter cet examen.")
    }
  }

  /** Découpe le texte d'une fiche en segments (valeurs saisies → gras). */
  function decouperValeurs(texte: string, valeurs: any): { t: string; val: boolean }[] {
    const vals: string[] = []
    try {
      const v = typeof valeurs === 'string' ? JSON.parse(valeurs) : valeurs
      if (v && typeof v === 'object') {
        for (const x of Object.values(v)) {
          const s = x != null ? String(x).trim() : ''
          if (s.length >= 1) vals.push(s)
        }
      }
    } catch {
      return [{ t: texte ?? '', val: false }]
    }
    vals.sort((a, b) => b.length - a.length)
    const CAR = '0-9A-Za-zÀ-ÖØ-öø-ÿ'
    const echapperRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const marqueurs: { token: string; val: string }[] = []
    let texte2 = texte ?? ''
    vals.forEach((val, i) => {
      if (!texte2.includes(val)) return
      const token = `\u0000V${i}\u0000`
      // Garde : la valeur doit être entourée de caractères non alphanumériques
      const regex = new RegExp(`(^|[^${CAR}])(${echapperRegex(val)})(?![${CAR}])`, 'g')
      let trouve = false
      texte2 = texte2.replace(regex, (tout: string, avant: string) => {
        trouve = true
        return avant + token
      })
      if (trouve) marqueurs.push({ token, val })
    })
    const segments: { t: string; val: boolean }[] = []
    let reste = texte2
    while (reste.length) {
      let prochain = -1
      let prochainToken: { token: string; val: string } | null = null
      for (const m of marqueurs) {
        const idx = reste.indexOf(m.token)
        if (idx !== -1 && (prochain === -1 || idx < prochain)) {
          prochain = idx
          prochainToken = m
        }
      }
      if (prochain === -1) {
        segments.push({ t: reste, val: false })
        break
      }
      if (prochain > 0) segments.push({ t: reste.slice(0, prochain), val: false })
      segments.push({ t: prochainToken!.val, val: true })
      reste = reste.slice(prochain + prochainToken!.token.length)
    }
    return segments
  }

  /** Retourne l'examen réalisé (avec résultats) pour une ligne de prestation. */
  function resultatExamen(l: any): { type: 'LABO' | 'IMAGERIE'; exam: any } | null {
    const labo = (detail?.passage?.examensLabo ?? []).find((e: any) => e.passagePrestationId === l.id)
    if (labo && (labo.statut === 'VALIDE' || labo.statut === 'RESULTATS')) {
      return { type: 'LABO', exam: labo }
    }
    const ima = (detail?.passage?.examensImagerie ?? []).find((e: any) => e.passagePrestationId === l.id)
    if (ima && (ima.statut === 'VALIDE' || ima.statut === 'RESULTATS')) {
      return { type: 'IMAGERIE', exam: ima }
    }
    return null
  }

  async function ajouterExamen() {
    if (!consultation || !nouvelExamenId) return
    setExamenEnCours(true)
    try {
      await http.post(`/consultations/${consultation.id}/examens/ajouter`, {
        prestationId: nouvelExamenId,
      })
      Alert.alert('✅ Examen ajouté', 'Payable à la caisse.')
      setNouvelExamenId(null)
      setNouvelExamenLaboId(null)
      setNouvelExamenImagerieId(null)
      await chargerDetail(passage!.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Ajout impossible.')
    } finally {
      setExamenEnCours(false)
    }
  }

  async function ajouterExamenLibre() {
    const libelle = nouvelExamenLibre.trim()
    if (!consultation || !libelle) return
    setExamenEnCours(true)
    try {
      await http.post(`/consultations/${consultation.id}/examens/ajouter`, { libelle })
      Alert.alert('✅ Examen externe ajouté', 'Non facturable à la clinique.')
      setNouvelExamenLibre('')
      await chargerDetail(passage!.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Ajout impossible.')
    } finally {
      setExamenEnCours(false)
    }
  }

  async function prescrireExamen(l: any) {
    if (!consultation) return
    try {
      await http.post(`/consultations/${consultation.id}/examens`, { lignesIds: [l.id] })
      await chargerDetail(passage!.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Prescription impossible.')
    }
  }

  async function retirerExamen(l: any) {
    try {
      await http.delete(`/consultations/examens/${l.id}`)
      await chargerDetail(passage!.id)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Retrait impossible.')
    }
  }

  const libelleStatut = (l: any) =>
    l.statut === 'NON_PRESCRITE'
      ? 'Pas prescrit'
      : l.statut === 'EN_ATTENTE'
        ? 'Prescrit — à payer'
        : l.statut === 'EXTERNE'
          ? 'Prescrit (externe)'
          : 'Payé'

  // ── Rendu ──
  return (
    <Screen padded={false}>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <Text style={styles.titre}>🩺 Consultation</Text>
        {estMedecin && !passage ? (
          <View style={styles.ligneDispo}>
            <Badge
              label={disponibilite === 'DISPONIBLE' ? 'Disponible' : 'Indisponible'}
              tone={disponibilite === 'DISPONIBLE' ? 'success' : 'muted'}
            />
            <Btn
              title={disponibilite === 'DISPONIBLE' ? 'Devenir indisponible' : 'Devenir disponible'}
              small
              variant="outline"
              onPress={basculerDisponibilite}
            />
          </View>
        ) : null}
        {!passage ? (
          <TextInput
            style={styles.recherche}
            placeholder="Nom et prénoms, code patient ou N° d'ordre…"
            placeholderTextColor="#94a3b8"
            value={recherche}
            onChangeText={setRecherche}
          />
        ) : null}
      </View>

      {!passage ? (
        <View style={{ padding: 16 }}>
          {estMedecin ? (
            <>
              <View style={styles.onglets}>
                {(
                  [
                    { key: 'file', label: `File d'attente (${fileMedecin.enAttente.length})` },
                    { key: 'terminees', label: `Terminées (${fileMedecin.terminees.length})` },
                    { key: 'recherche', label: 'Recherche' },
                  ] as const
                ).map((o) => (
                  <TouchableOpacity
                    key={o.key}
                    style={[styles.onglet, vueMedecin === o.key && styles.ongletActif]}
                    onPress={() => setVueMedecin(o.key)}
                  >
                    <Text style={[styles.ongletTexte, vueMedecin === o.key && styles.ongletTexteActif]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {vueMedecin === 'file' ? (
                <>
                  <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
                    <Btn title="🔄 Actualiser" small variant="outline" onPress={() => chargerFileMedecin()} />
                  </View>
                  {chargementFile ? <EtatVide texte="Chargement…" image={false} /> : null}
                  {!chargementFile && fileMedecin.enAttente.length === 0 ? (
                    <EtatVide
                      texte={
                        disponibilite === 'DISPONIBLE'
                          ? 'Aucun patient en attente pour le moment.'
                          : 'Vous êtes indisponible : devenez disponible pour recevoir des patients.'
                      }
                    />
                  ) : null}
                  {fileMedecin.enAttente.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={styles.item}
                      onPress={() => ouvrirAffectation(a, true)}
                    >
                      <Text style={styles.itemTitre}>
                        {a.passage?.patient?.nom ?? ''} {a.passage?.patient?.prenom ?? ''}
                      </Text>
                      <Text style={styles.itemSous}>
                        {a.passage?.numeroOrdre ?? ''} · {a.passage?.service?.nom ?? ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}

              {vueMedecin === 'terminees' ? (
                <>
                  {fileMedecin.terminees.length === 0 ? (
                    <EtatVide texte="Aucune consultation terminée aujourd'hui." />
                  ) : null}
                  {fileMedecin.terminees.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={styles.item}
                      onPress={() => ouvrirAffectation(a, false)}
                    >
                      <Text style={styles.itemTitre}>
                        {a.passage?.patient?.nom ?? ''} {a.passage?.patient?.prenom ?? ''}
                      </Text>
                      <Text style={styles.itemSous}>
                        {a.passage?.numeroOrdre ?? ''} · {a.passage?.service?.nom ?? ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}

              {vueMedecin === 'recherche' ? (
                <>
                  {resultats.map((r) => (
                    <TouchableOpacity key={r.id} style={styles.item} onPress={() => choisirPassage(r)}>
                      <Text style={styles.itemTitre}>
                        {r.patient.nom} {r.patient.prenom}
                      </Text>
                      <Text style={styles.itemSous}>
                        {r.numeroOrdre} · {r.patient.code} · {r.service?.nom ?? ''} ·{' '}
                        {r.consultable ? 'Consultable' : 'Non activé (paiement requis)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              {resultats.map((r) => (
                <TouchableOpacity key={r.id} style={styles.item} onPress={() => choisirPassage(r)}>
                  <Text style={styles.itemTitre}>
                    {r.patient.nom} {r.patient.prenom}
                  </Text>
                  <Text style={styles.itemSous}>
                    {r.numeroOrdre} · {r.patient.code} · {r.service?.nom ?? ''} ·{' '}
                    {r.consultable ? 'Consultable' : 'Non activé (paiement requis)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.ficheTitre}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ficheNom}>
                {passage.patient.nom} {passage.patient.prenom} · {passage.numeroOrdre}
              </Text>
              <Text style={styles.ficheSous}>
                {detail?.passage?.patient?.age ?? '—'} ans · {detail?.passage?.patient?.sexe ?? '—'} ·{' '}
                {detail?.passage?.service?.nom ?? ''}
              </Text>
              {consultation ? (
                <Badge label={consultation.statut === 'VALIDEE' ? 'Validée' : 'En cours'} tone={consultation.statut === 'VALIDEE' ? 'success' : 'warning'} />
              ) : null}
            </View>
            <Btn title="✕" small variant="outline" onPress={fermerPassage} />
          </View>

          {/* Onglets */}
          <View style={styles.onglets}>
            {(['fiche', 'medicaments', 'soins', 'examens', 'reference', 'certificat'] as const).map((o) => (
              <TouchableOpacity key={o} style={[styles.onglet, onglet === o && styles.ongletActif]} onPress={() => setOnglet(o)}>
                <Text
                  style={[styles.ongletTexte, onglet === o && styles.ongletTexteActif]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {o === 'fiche'
                    ? 'Fiche'
                    : o === 'medicaments'
                      ? 'Médicaments'
                      : o === 'soins'
                        ? 'Soins'
                        : o === 'examens'
                        ? 'Examens'
                        : o === 'reference'
                          ? 'Référence'
                          : 'Certificat'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {onglet === 'fiche' ? (
              <>
                <Card>
                  <SectionTitle>Consultation</SectionTitle>
                  <ListeCombo label="Motif de consultation" value={fiche.motif ?? ''} options={listes.motif ?? []} placeholder="— Choisir ou saisir —" onChange={(v) => setFiche({ ...fiche, motif: v })} />
                  <Input label="Examen physique (observation)" value={fiche.observation ?? ''} onChangeText={(t) => setFiche({ ...fiche, observation: t })} multiline />
                  <Text style={styles.label}>Mode d'entrée</Text>
                  <Chips
                    options={['Venue directe', 'Référé(e) centre', 'Référé(e) médecin', 'Autre']}
                    value={fiche.modeEntree ?? ''}
                    onChange={(v) => setFiche({ ...fiche, modeEntree: v })}
                  />
                </Card>
                <Card>
                  <SectionTitle>Antécédents</SectionTitle>
                  <Text style={styles.label}>HTA</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.hta == null ? null : fiche.hta ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, hta: v === 'Oui' })} />
                  <Text style={styles.label}>Diabète</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.diabete == null ? null : fiche.diabete ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, diabete: v === 'Oui' })} />
                  <Text style={styles.label}>Tabac</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.tabac == null ? null : fiche.tabac ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, tabac: v === 'Oui' })} />
                  <Text style={styles.label}>Alcool</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.alcool == null ? null : fiche.alcool ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, alcool: v === 'Oui' })} />
                  {/* DDR et grossesse : sans objet pour un patient de sexe masculin */}
                  {!patientMasculin ? (
                    <>
                      <Text style={styles.label}>Grossesse en cours</Text>
                      <Chips options={['Oui', 'Non']} value={fiche.grossesseEnCours == null ? null : fiche.grossesseEnCours ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, grossesseEnCours: v === 'Oui' })} />
                      <Input label="DDR (date des dernières règles)" value={fiche.ddr ?? ''} onChangeText={(t) => setFiche({ ...fiche, ddr: t })} placeholder="AAAA-MM-JJ" />
                    </>
                  ) : null}
                  <Text style={styles.label}>Traitement médicamenteux antérieur / en cours</Text>
                  <Chips
                    options={['Oui', 'Non']}
                    value={fiche.traitementAnterieurOuiNon == null ? null : fiche.traitementAnterieurOuiNon ? 'Oui' : 'Non'}
                    onChange={(v) => setFiche({ ...fiche, traitementAnterieurOuiNon: v === 'Oui' })}
                  />
                  {/* Les trois champs n'apparaissent que si le médecin répond « Oui » */}
                  {fiche.traitementAnterieurOuiNon === true ? (
                    <>
                      <Input label="Médicaments" value={fiche.traitementMedicaments ?? ''} onChangeText={(t) => setFiche({ ...fiche, traitementMedicaments: t })} placeholder="Ex : Paracétamol, Amlodipine" />
                      <Input label="Durée" value={fiche.traitementDuree ?? ''} onChangeText={(t) => setFiche({ ...fiche, traitementDuree: t })} placeholder="Ex : depuis 2 mois" />
                      <Input label="Dose" value={fiche.traitementDose ?? ''} onChangeText={(t) => setFiche({ ...fiche, traitementDose: t })} placeholder="Ex : 1 cp matin et soir" />
                    </>
                  ) : null}
                  <ListeCombo label="Antécédents médicaux (maladies)" value={fiche.antecedentsMedicaux ?? ''} options={listes.antecedent ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, antecedentsMedicaux: v })} />
                  <Text style={styles.label}>Antécédents chirurgicaux</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.chirurgie == null ? null : fiche.chirurgie ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, chirurgie: v === 'Oui' })} />
                  {fiche.chirurgie === true ? (
                    <>
                      <ListeCombo label="Type d'intervention" value={fiche.chirurgieType ?? ''} options={listes.intervention ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, chirurgieType: v })} />
                      <Input label="Durée / année" value={fiche.chirurgieAnnee ?? ''} onChangeText={(t) => setFiche({ ...fiche, chirurgieAnnee: t })} placeholder="Ex : 2019, il y a 5 ans" />
                    </>
                  ) : null}
                </Card>
                <Card>
                  <SectionTitle>Constantes & examen physique</SectionTitle>
                  <InfoLigne label="Poids / Taille" value={`${detail?.passage?.poids ?? '—'} kg · ${detail?.passage?.taille ?? '—'} cm`} />
                  <InfoLigne label="Température / Pouls" value={`${detail?.passage?.temperature ?? '—'} °C · ${detail?.passage?.pouls ?? '—'} bpm`} />
                  <InfoLigne
                    label="TA gauche / droite"
                    value={`${detail?.passage?.tensionGauche ?? '—'} · ${detail?.passage?.tensionDroite ?? '—'}`}
                  />
                  <Input label="IMC (calculé automatiquement)" value={imcCalcule} editable={false} keyboardType="numeric" />
                  <Input label="Z-score" value={fiche.zscore ?? ''} onChangeText={(t) => setFiche({ ...fiche, zscore: t })} />
                  <Input label="Fréquence respiratoire" value={fiche.frequenceRespiratoire ?? ''} onChangeText={(t) => setFiche({ ...fiche, frequenceRespiratoire: t })} keyboardType="numeric" />
                  <View style={styles.ligne}>
                    <View style={styles.ligneItem}>
                      <Input label="Périmètre brachial (cm)" value={fiche.perimetreBrachial ?? ''} onChangeText={(t) => setFiche({ ...fiche, perimetreBrachial: t })} keyboardType="numeric" />
                    </View>
                    <View style={styles.ligneItem}>
                      <Input label="Périmètre crânien (cm)" value={fiche.perimetreCranien ?? ''} onChangeText={(t) => setFiche({ ...fiche, perimetreCranien: t })} keyboardType="numeric" />
                    </View>
                  </View>
                </Card>
                <Card>
                  <SectionTitle>Dépistages</SectionTitle>
                  <Text style={styles.label}>Recherche de TB</Text>
                  <Chips options={['Oui', 'Non', 'NA']} value={fiche.rechercheTB || null} onChange={(v) => setFiche({ ...fiche, rechercheTB: v })} />
                  <Text style={styles.label}>Cas présumé de TB référé</Text>
                  <Chips
                    options={['À revoir', 'Décédé(e)']}
                    value={fiche.casPresumeTB === 'A_REVOIR' ? 'À revoir' : fiche.casPresumeTB === 'DECEDE' ? 'Décédé(e)' : null}
                    onChange={(v) => setFiche({ ...fiche, casPresumeTB: v === 'À revoir' ? 'A_REVOIR' : 'DECEDE' })}
                  />
                  <Text style={styles.label}>TDR paludisme</Text>
                  <Chips options={['positif', 'négatif', 'non réalisé', 'NA']} value={fiche.tdrPaludisme || null} onChange={(v) => setFiche({ ...fiche, tdrPaludisme: v })} />
                  <Text style={styles.label}>Goutte épaisse</Text>
                  <Chips options={['positive', 'négative', 'non réalisée', 'NA']} value={fiche.goutteEpaisse || null} onChange={(v) => setFiche({ ...fiche, goutteEpaisse: v })} />
                  <Text style={styles.label}>MILDA éligible</Text>
                  <Chips options={['Oui', 'Non', 'NA']} value={fiche.mildaEligible || null} onChange={(v) => setFiche({ ...fiche, mildaEligible: v })} />
                  <Text style={styles.label}>MILDA remise</Text>
                  <Chips options={['Oui', 'Non', 'NA']} value={fiche.mildaRemise || null} onChange={(v) => setFiche({ ...fiche, mildaRemise: v })} />
                  <Text style={styles.label}>CDIP proposé</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.cdipPropose == null ? null : fiche.cdipPropose ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, cdipPropose: v === 'Oui' })} />
                  <Text style={styles.label}>CDIP réalisé</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.cdipRealise == null ? null : fiche.cdipRealise ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, cdipRealise: v === 'Oui' })} />
                  <Input label="Code dépistage" value={fiche.codeDepistage ?? ''} onChangeText={(t) => setFiche({ ...fiche, codeDepistage: t })} />
                  <View style={styles.ligne}>
                    <View style={styles.ligneItem}>
                      <Input label="Glycémie à jeun" value={fiche.glycemieAjeun ?? ''} onChangeText={(t) => setFiche({ ...fiche, glycemieAjeun: t })} keyboardType="numeric" />
                    </View>
                    <View style={styles.ligneItem}>
                      <Input label="Glycémie non à jeun" value={fiche.glycemieNonAjeun ?? ''} onChangeText={(t) => setFiche({ ...fiche, glycemieNonAjeun: t })} keyboardType="numeric" />
                    </View>
                  </View>
                  <Input label="Taux d'hémoglobine (g/dl)" value={fiche.tauxHemoglobine ?? ''} onChangeText={(t) => setFiche({ ...fiche, tauxHemoglobine: t })} keyboardType="numeric" />
                  <Text style={styles.label}>Test de syphilis</Text>
                  <Chips options={['positif', 'négatif', 'non réalisé']} value={fiche.testSyphilis || null} onChange={(v) => setFiche({ ...fiche, testSyphilis: v })} />
                  <Text style={styles.label}>Test d'hépatite</Text>
                  <Chips options={['positif', 'négatif', 'non réalisé']} value={fiche.testHepatite || null} onChange={(v) => setFiche({ ...fiche, testHepatite: v })} />
                  {testsOrdonnance.length > 0 ? (
                    <Text style={styles.note}>🧾 Inscrits sur l'ordonnance à l'enregistrement : {testsOrdonnance.join(', ')}</Text>
                  ) : null}
                  {/* Liste déroulante à cases à cocher : tous les examens cochés sont enregistrés (« A ; B ; C ») */}
                  <ListeCombo
                    label="Autres examens"
                    multiple
                    value={fiche.autresExamens ?? ''}
                    options={[
                      // Examens du catalogue (labo / imagerie) : prescrits automatiquement à l'enregistrement
                      ...prestations
                        .filter((x: any) => x.actif && ['EXAMEN_LABO', 'IMAGERIE'].includes(x.type))
                        .map((x: any) => ({ value: `p${x.id}`, label: String(x.libelle) })),
                      ...(listes.examen ?? []).filter(
                        (o: any) => !prestations.some((x: any) => String(x.libelle).toUpperCase() === String(o.label).toUpperCase()),
                      ),
                    ]}
                    placeholder="— Cocher un ou plusieurs examens —"
                    onChange={(v) => setFiche({ ...fiche, autresExamens: v })}
                  />
                  {/* Le diagnostic se retient après les examens */}
                  <ListeCombo label="Diagnostic retenu" value={fiche.diagnostic ?? ''} options={listes.diagnostic ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, diagnostic: v })} />
                  <ListeCombo label="Pathologies associées" value={fiche.pathologiesAssociees ?? ''} options={listes.pathologie ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, pathologiesAssociees: v })} />
                </Card>
                <Card>
                  <SectionTitle>Données administratives</SectionTitle>
                  <View style={styles.ligne}>
                    <View style={styles.ligneItem}>
                      <ListeCombo label="Profession" value={fiche.profession ?? ''} options={listes.profession ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, profession: v })} />
                    </View>
                    <View style={styles.ligneItem}>
                      <ListeCombo label="Nationalité" value={fiche.nationalite ?? ''} options={listes.nationalite ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, nationalite: v })} />
                    </View>
                  </View>
                  <Input label="Scolarisation" value={fiche.scolarisation ?? ''} onChangeText={(t) => setFiche({ ...fiche, scolarisation: t })} />
                  <Input label="Statut conjugal" value={fiche.statutConjugal ?? ''} onChangeText={(t) => setFiche({ ...fiche, statutConjugal: t })} />
                  <Input label="Type de population" value={fiche.typePopulation ?? ''} onChangeText={(t) => setFiche({ ...fiche, typePopulation: t })} />
                  <Input label="Protection sociale" value={fiche.protectionSociale ?? ''} onChangeText={(t) => setFiche({ ...fiche, protectionSociale: t })} />
                  <Text style={styles.label}>Autres populations à haut risque</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.populationsRisque || null} onChange={(v) => setFiche({ ...fiche, populationsRisque: v })} />
                  <ListeCombo label="Résidence habituelle" value={fiche.residenceHabituelle ?? ''} options={listes.residence ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, residenceHabituelle: v })} />
                  <ListeCombo label="Résidence actuelle" value={fiche.residenceActuelle ?? ''} options={listes.residence ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFiche({ ...fiche, residenceActuelle: v })} />
                </Card>
                <Card>
                  <SectionTitle>Prescription de médicaments</SectionTitle>
                  <Text style={styles.label}>Prescrire des médicaments ?</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.prescriptionMedicaments == null ? null : fiche.prescriptionMedicaments ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, prescriptionMedicaments: v === 'Oui' })} />
                  {fiche.prescriptionMedicaments !== true ? (
                    <Text style={styles.note}>Choisissez « Oui » pour prescrire des médicaments.</Text>
                  ) : null}
                  <View
                    pointerEvents={fiche.prescriptionMedicaments === true ? 'auto' : 'none'}
                    style={{ opacity: fiche.prescriptionMedicaments === true ? 1 : 0.45 }}
                  >
                  {/* Prescription de médicaments intégrée à la fiche (§ cahier des charges) */}
                  {(consultation?.medicaments ?? []).map((p: any) => (
                    <View key={p.id} style={styles.ligneMed}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.medNom}>
                          {p.medicamentNom}
                          {p.prixUnitaire != null ? ` — ${formatPrix(p.prixUnitaire)} F` : ''}
                        </Text>
                        <Text style={styles.medDetail}>
                          {detailPrescription(p)}
                        </Text>
                      </View>
                      <Btn title="✕" small variant="danger" onPress={() => retirerMedicament(p.id)} />
                    </View>
                  ))}

                  {/* Formulaire de prescription intégré à la fiche */}
                  <Input label="Médicament (catalogue)">
                    <ListeSelect
                      value={ficheMedId}
                      options={optionsMedicaments}
                      placeholder="— Choisir —"
                      onChange={(v) => setFicheMedId(v as number | null)}
                    />
                  </Input>
                  <Input
                    label="Ou saisir librement le nom"
                    value={ficheMedNom}
                    onChangeText={setFicheMedNom}
                    placeholder="Nom du médicament"
                  />
                  <ListeCombo label="Posologie *" value={ficheMedPoso} options={listes.posologie ?? []} placeholder="— Choisir ou ajouter —" onChange={setFicheMedPoso} />
                  <View style={styles.ligne}>
                    <View style={styles.ligneItem}>
                      <Input label={`Quantité à acheter (${uniteDuMedicament(ficheMedId)}) *`} keyboardType="number-pad" value={ficheMedQte} onChangeText={setFicheMedQte} placeholder="Ex : 2" />
                    </View>
                    <View style={styles.ligneItem}>
                      <Input label="Durée" value={ficheMedDuree} onChangeText={setFicheMedDuree} placeholder="Ex : 5 j" />
                    </View>
                  </View>
                  <Btn
                    title="＋ Ajouter"
                    small
                    onPress={ajouterMedicamentFiche}
                    loading={ficheMedEnCours}
                  />
                  </View>
                </Card>
                <Card>
                  <SectionTitle>Issue de la consultation</SectionTitle>
                  <Chips
                    options={['Retour à domicile', 'Hospitalisé(e)', 'M.O.', 'Référé(e) en interne', 'Référé(e) externe']}
                    value={
                      fiche.issueSortie === 'DOMICILE'
                        ? 'Retour à domicile'
                        : fiche.issueSortie === 'HOSPITALISE'
                        ? 'Hospitalisé(e)'
                        : fiche.issueSortie === 'MO'
                          ? 'M.O.'
                          : fiche.issueSortie === 'REFERE_INTERNE'
                            ? 'Référé(e) en interne'
                            : fiche.issueSortie === 'REFERE_EXTERNE'
                              ? 'Référé(e) externe'
                              : null
                    }
                    onChange={(v) =>
                      setFiche({
                        ...fiche,
                        issueSortie:
                          v === 'Retour à domicile'
                            ? 'DOMICILE'
                            : v === 'Hospitalisé(e)'
                            ? 'HOSPITALISE'
                            : v === 'M.O.'
                              ? 'MO'
                              : v === 'Référé(e) en interne'
                                ? 'REFERE_INTERNE'
                                : 'REFERE_EXTERNE',
                      })
                    }
                  />
                  {fiche.issueSortie === 'MO' ? (
                    <>
                      <View style={styles.ligne}>
                        <View style={styles.ligneItem}>
                          <Input
                            label="Durée M.O. (heures)"
                            value={fiche.moDureeHeures ?? ''}
                            onChangeText={(t) => setFiche({ ...fiche, moDureeHeures: t })}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={styles.ligneItem}>
                          <Input
                            label="Durée M.O. (minutes)"
                            value={fiche.moDureeMinutes ?? ''}
                            onChangeText={(t) => setFiche({ ...fiche, moDureeMinutes: t })}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      <Input label="Début M.O." value={fiche.moDebut ?? ''} onChangeText={(t) => setFiche({ ...fiche, moDebut: t })} placeholder="AAAA-MM-JJ HH:MM" />
                      <Input label="Fin M.O." value={fiche.moFin ?? ''} onChangeText={(t) => setFiche({ ...fiche, moFin: t })} placeholder="AAAA-MM-JJ HH:MM" />
                      <Input label="Chambre / lit">
                        <ListeSelect
                          value={fiche.litId ?? null}
                          options={lits.map((l) => ({ value: l.id, label: l.label }))}
                          placeholder="— Choisir un lit libre —"
                          onChange={(v) => setFiche({ ...fiche, litId: v as number })}
                        />
                      </Input>
                    </>
                  ) : null}
                  {fiche.issueSortie === 'HOSPITALISE' ? (
                    <>
                      <Text style={styles.label}>Type d'hospitalisation</Text>
                      <Chips
                        options={['Mise en observation (0-3 j)', 'Moyenne (3-10 j)', 'Longue (> 10 j)']}
                        value={
                          fiche.typeHospitalisation === 'MISE_EN_OBSERVATION'
                            ? 'Mise en observation (0-3 j)'
                            : fiche.typeHospitalisation === 'MOYENNE'
                              ? 'Moyenne (3-10 j)'
                              : fiche.typeHospitalisation === 'LONGUE'
                                ? 'Longue (> 10 j)'
                                : null
                        }
                        onChange={(v) =>
                          setFiche({
                            ...fiche,
                            typeHospitalisation:
                              v === 'Mise en observation (0-3 j)'
                                ? 'MISE_EN_OBSERVATION'
                                : v === 'Moyenne (3-10 j)'
                                  ? 'MOYENNE'
                                  : 'LONGUE',
                          })
                        }
                      />
                      <View style={styles.ligne}>
                        <View style={styles.ligneItem}>
                          <Input label="Durée prévue" value={fiche.hospitalisationDuree ?? ''} onChangeText={(t) => setFiche({ ...fiche, hospitalisationDuree: t })} placeholder="Ex : 3 jours" />
                        </View>
                        <View style={styles.ligneItem}>
                          <Input
                            label="Jours (facturation) *"
                            value={fiche.hospitalisationDureeJours ? String(fiche.hospitalisationDureeJours) : ''}
                            onChangeText={(t) => setFiche({ ...fiche, hospitalisationDureeJours: Number(t) || undefined })}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      <Input label="Chambre / lit *">
                        <ListeSelect
                          value={fiche.litId ?? null}
                          options={lits.map((l) => ({ value: l.id, label: l.label }))}
                          placeholder="— Choisir un lit libre —"
                          onChange={(v) => setFiche({ ...fiche, litId: v as number })}
                        />
                      </Input>
                      <Text style={styles.note}>
                        💡 La facture (jours × tarif de la chambre) part à la caisse — payable à l'entrée ou à la sortie.
                      </Text>
                    </>
                  ) : null}
                </Card>
                {historique.length > 0 ? (
                  <Card>
                    <SectionTitle>📋 Synthèse du dossier</SectionTitle>
                    <Text style={styles.syntheseTitre}>🩺 Antécédents médicaux</Text>
                    <Text style={styles.note}>
                      {syntheseDossier.antecedents.length ? syntheseDossier.antecedents.join(' · ') : 'Aucun antécédent renseigné.'}
                    </Text>
                    <Text style={styles.syntheseTitre}>📌 Diagnostics déjà retenus</Text>
                    {syntheseDossier.diagnostics.length === 0 ? <Text style={styles.note}>Aucun diagnostic enregistré.</Text> : null}
                    {syntheseDossier.diagnostics.map((d) => (
                      <Text key={d.libelle} style={styles.note}>
                        • <Text style={{ fontWeight: '800' }}>{d.libelle}</Text> — {d.nb > 1 ? `${d.nb} fois, dernier le ` : 'le '}
                        {new Date(d.date).toLocaleDateString('fr-FR')}
                      </Text>
                    ))}
                    <Text style={styles.syntheseTitre}>🧬 Pathologies associées déjà diagnostiquées</Text>
                    {syntheseDossier.pathologies.length === 0 ? <Text style={styles.note}>Aucune pathologie associée.</Text> : null}
                    {syntheseDossier.pathologies.map((d) => (
                      <Text key={d.libelle} style={styles.note}>
                        • <Text style={{ fontWeight: '800' }}>{d.libelle}</Text> — {d.nb > 1 ? `${d.nb} fois, dernier le ` : 'le '}
                        {new Date(d.date).toLocaleDateString('fr-FR')}
                      </Text>
                    ))}
                  </Card>
                ) : null}
                {historique.length > 0 ? (
                  <Card>
                    <SectionTitle>Historique médical — du plus récent au plus ancien</SectionTitle>
                    {historique.map((h: any, i: number) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.item}
                        onPress={() => {
                          setHistoOnglet('consultation')
                          setHistoDetail(h)
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitre}>
                            {new Date(h.createdAt ?? h.date).toLocaleDateString('fr-FR')} ·{' '}
                            <Text style={{ color: colors.primary, textDecorationLine: 'underline' }}>
                              {h.passage?.numeroOrdre ?? '—'}
                            </Text>
                          </Text>
                          <Text style={styles.itemSous}>
                            {h.passage?.service?.nom ?? ''} · {h.diagnostic ?? h.motif ?? ''}
                          </Text>
                        </View>
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>👁️</Text>
                      </TouchableOpacity>
                    ))}
                  </Card>
                ) : null}
                <Btn title="💾 Enregistrer la fiche" onPress={enregistrerFiche} loading={saving} />
                {consultation && consultation.statut !== 'VALIDEE' ? (
                  <View style={{ marginTop: 10 }}>
                    <Btn title="✓ Valider la consultation" variant="outline" onPress={validerConsultation} />
                  </View>
                ) : null}
              </>
            ) : onglet === 'medicaments' ? (
              <>
                <Card>
                  <SectionTitle>Prescription de médicaments</SectionTitle>
                  {consultation ? (
                    <>
                      {/* Plusieurs ordonnances indépendantes par consultation */}
                      <View style={styles.ordoPuces}>
                        {ordonnancesConsult.map((o) => (
                          <TouchableOpacity
                            key={o.id}
                            style={[styles.ordoPuce, o.id === ordonnanceActiveId && styles.ordoPuceActive]}
                            onPress={() => setOrdonnanceActiveId(o.id)}
                          >
                            <Text style={[styles.ordoPuceTexte, o.id === ordonnanceActiveId && styles.ordoPuceTexteActif]}>
                              💊 {o.numero} · {o.statut === 'TRAITEE' ? 'délivrée' : 'en attente'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.ordoNouvelle} onPress={nouvelleOrdonnance}>
                          <Text style={styles.ordoNouvelleTexte}>＋ Nouvelle ordonnance</Text>
                        </TouchableOpacity>
                      </View>
                      {ordonnanceActive?.statut === 'TRAITEE' ? (
                        <Text style={styles.note}>
                          🔒 L'ordonnance {ordonnanceActive.numero} a déjà été délivrée : elle n'est plus modifiable. Créez une nouvelle ordonnance.
                        </Text>
                      ) : null}
                      {medicamentsOrdonnance.length === 0 ? <Text style={styles.note}>Aucun médicament sur cette ordonnance.</Text> : null}
                      {medicamentsOrdonnance.map((p: any) => (
                        <View key={p.id} style={styles.ligneMed}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.medNom}>
                              {p.medicamentNom}
                              {p.forme ? ` (${p.forme})` : ''}
                              {p.prixUnitaire != null ? ` — ${formatPrix(p.prixUnitaire)} F` : ''}
                            </Text>
                            <Text style={styles.medDetail}>
                              {detailPrescription(p)}
                            </Text>
                          </View>
                          {ordonnanceActive?.statut !== 'TRAITEE' ? (
                            <Btn title="✕" small variant="danger" onPress={() => retirerMedicament(p.id)} />
                          ) : null}
                        </View>
                      ))}
                      <Btn
                        title={`＋ Ajouter un médicament${ordonnanceActive ? ` à ${ordonnanceActive.numero}` : ''}`}
                        disabled={ordonnanceActive?.statut === 'TRAITEE'}
                        variant="outline"
                        onPress={() => {
                          setModaleMed(true)
                          setMedForm({ medicamentId: null, nom: '', posologie: '', quantite: '', duree: '' })
                        }}
                      />
                      <View style={{ marginTop: 12 }}>
                        <Btn title="🖨️ Imprimer l'ordonnance" onPress={imprimerOrdonnance} />
                      </View>
                    </>
                  ) : (
                    <EtatVide texte="Enregistrez d'abord la fiche de consultation." />
                  )}
                </Card>
                {ordoApercu ? <ApercuTexte contenu={ordoApercu} /> : null}
              </>
            ) : onglet === 'soins' ? (
              <Card>
                <SectionTitle>Prescription des soins</SectionTitle>
                {consultation ? (
                  <>
                    <Text style={styles.note}>
                      Les soins prescrits apparaissent aussitôt dans le module Soins. Leurs médicaments partent sur une
                      ordonnance « Soins » que l'infirmier retire à la pharmacie.
                    </Text>
                    {(consultation.soins ?? []).length === 0 ? <Text style={styles.note}>Aucun soin prescrit.</Text> : null}
                    {(consultation.soins ?? []).map((s: any) => (
                      <View key={s.id} style={styles.ligneMed}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.medNom}>
                            💉 {s.typeSoin}
                            {s.ordonnance ? ` · ${s.ordonnance.numero}` : ''}
                          </Text>
                          {s.lignes.map((l: any) => (
                            <Text key={l.id} style={styles.medDetail}>
                              💊 {texteLigneSoin(l)} · {l.quantitePharmacie} à retirer
                            </Text>
                          ))}
                          <Text style={styles.medDetail}>
                            {s.foisParJour} fois/jour · {s.dureeJours} j · {s.administrations.length}/{s.nbAdministrations} faite(s)
                          </Text>
                          {s.instructions ? <Text style={styles.medDetail}>📝 {s.instructions}</Text> : null}
                          <View style={{ marginTop: 4, flexDirection: 'row' }}>
                            <Badge label={libelleStatutSoin(s.statut)} tone={toneStatutSoin(s.statut)} />
                          </View>
                        </View>
                        {s.administrations.length === 0 ? (
                          <Btn title="✕" small variant="danger" onPress={() => retirerSoin(s)} />
                        ) : s.statut === 'EN_COURS' ? (
                          <Btn title="⏹ Arrêter" small variant="outline" onPress={() => arreterSoin(s)} />
                        ) : null}
                      </View>
                    ))}
                    <View style={{ marginTop: 10 }}>
                      <Btn title="＋ Prescrire un soin" variant="outline" onPress={ouvrirSoin} />
                    </View>
                  </>
                ) : (
                  <EtatVide texte="Enregistrez d'abord la fiche de consultation." />
                )}
              </Card>
            ) : onglet === 'examens' ? (
              <Card>
                <SectionTitle>Examens (laboratoire / imagerie)</SectionTitle>
                {consultation ? (
                  <>
                    <Input label="Examen du catalogue">
                      <ListeSelect
                        value={nouvelExamenLaboId}
                        options={optionsExamensLabo}
                        placeholder="— 🔬 Laboratoire —"
                        onChange={(v) => {
                          setNouvelExamenLaboId(v as number)
                          setNouvelExamenImagerieId(null)
                          setNouvelExamenId(v as number)
                        }}
                      />
                      <ListeSelect
                        value={nouvelExamenImagerieId}
                        options={optionsExamensImagerie}
                        placeholder="— 🩻 Imagerie —"
                        onChange={(v) => {
                          setNouvelExamenImagerieId(v as number)
                          setNouvelExamenLaboId(null)
                          setNouvelExamenId(v as number)
                        }}
                      />
                    </Input>
                    <Btn title="＋ Ajouter l'examen" variant="outline" onPress={ajouterExamen} loading={examenEnCours} disabled={!nouvelExamenId} />
                    <View style={{ marginTop: 10 }}>
                      <Input label="Saisie libre (hors clinique, non facturable)" value={nouvelExamenLibre} onChangeText={setNouvelExamenLibre} placeholder="Ex : Scanner thoracique (CHU)" />
                    </View>
                    <Btn title="＋ Ajouter (libre)" variant="outline" onPress={ajouterExamenLibre} loading={examenEnCours} disabled={!nouvelExamenLibre.trim()} />
                  </>
                ) : null}
                {(detail?.passage?.prestations ?? []).map((l: any) => (
                  <View key={l.id} style={styles.ligneMed}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medNom}>{l.libelle}</Text>
                      <Text style={styles.medDetail}>
                        {l.service?.nom ?? '—'} · {libelleStatut(l)}
                      </Text>
                      <Badge
                        label={estFait(l) ? '✓ Déjà fait' : '● Reste à faire'}
                        tone={estFait(l) ? 'success' : 'danger'}
                      />
                    </View>
                    {resultatExamen(l) || (l.prestation?.type === 'IMAGERIE' && fichesPassage.length > 0) ? (
                      <Btn
                        title="📋 Résultat"
                        small
                        variant="outline"
                        onPress={() => {
                          const r = resultatExamen(l)
                          // Fiches seules (pas encore de CR validé) : on ouvre quand même
                          setResultatCourant(r ?? { type: 'IMAGERIE', exam: null, libelle: l.libelle })
                          setResultatVisible(true)
                        }}
                      />
                    ) : null}
                    {l.statut === 'NON_PRESCRITE' && consultation ? (
                      <Btn title="✍️ Prescrire" small variant="outline" onPress={() => prescrireExamen(l)} />
                    ) : null}
                    {/* Examen fait hors clinique : photo du résultat rapporté par le patient */}
                    {l.statut === 'EXTERNE' && !l.resultatExterne ? (
                      <Btn title="📎 Joindre" small onPress={() => ouvrirJoindre(l)} />
                    ) : null}
                    {l.resultatExterne ? (
                      <Btn title="👁️ Voir" small variant="outline" onPress={() => voirDocument(l.id, l.libelle)} />
                    ) : null}
                    {l.statut === 'EN_ATTENTE' && ['EXAMEN_LABO', 'IMAGERIE'].includes(l.prestation?.type) && !resultatExamen(l) ? (
                      <Btn title="📎 Fait ailleurs" small variant="outline" onPress={() => ouvrirJoindre(l)} />
                    ) : null}
                    {(l.statut === 'EN_ATTENTE' || l.statut === 'EXTERNE') && consultation && !l.resultatExterne ? (
                      <Btn title="✕" small variant="danger" onPress={() => retirerExamen(l)} />
                    ) : null}
                  </View>
                ))}
              </Card>
            ) : onglet === 'reference' ? (
              /* ── Onglet Référence / contre-référence ── */
              <Card>
                <SectionTitle>📤 Fiche de référence / contre-référence</SectionTitle>
                {detail?.passage?.typePatient === 'EXTERNE' ? (
                  <Text style={styles.note}>La fiche de référence ne concerne pas les patients externes.</Text>
                ) : detail?.passage ? (
                  <ReferenceFicheMobile passage={detail.passage} />
                ) : null}
              </Card>
            ) : (
              /* ── Onglet Certificat d'arrêt ── */
              <Card>
                <SectionTitle>Certificat d'arrêt de travail</SectionTitle>
                <Input label="Mme / Mlle / M." value={formCert.civilite} onChangeText={(t) => setFormCert({ ...formCert, civilite: t })} />
                <Input label="Patient(e)" value={formCert.nomPatient} onChangeText={(t) => setFormCert({ ...formCert, nomPatient: t })} />
                <Input label="Né(e) le (AAAA-MM-JJ)" value={formCert.dateNaissance} onChangeText={(t) => setFormCert({ ...formCert, dateNaissance: t })} />
                <ListeCombo label="Profession" value={formCert.profession} options={listes.profession ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setFormCert({ ...formCert, profession: v })} />
                <Input label="Durée de l'arrêt (jours)" value={formCert.dureeJours} onChangeText={(t) => setFormCert({ ...formCert, dureeJours: t })} keyboardType="numeric" />
                <Input label="Du (AAAA-MM-JJ)" value={formCert.debut} onChangeText={(t) => setFormCert({ ...formCert, debut: t })} />
                <Input label="Au (AAAA-MM-JJ)" value={formCert.fin} onChangeText={(t) => setFormCert({ ...formCert, fin: t })} />
                <Input label="Médecin" value={formCert.medecin} onChangeText={(t) => setFormCert({ ...formCert, medecin: t })} />
                <Input label="Fait à" value={formCert.lieu} onChangeText={(t) => setFormCert({ ...formCert, lieu: t })} />
                <Btn title="💾 Enregistrer le certificat" onPress={enregistrerCertificat} loading={savingCert} />
                <SectionTitle>Certificats enregistrés</SectionTitle>
                {certs.length === 0 ? <EtatVide texte="Aucun certificat — enregistrez pour créer le premier." /> : null}
                {certs.map((c: any) => (
                  <View key={c.id} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitre}>{c.numero} — {c.dureeJours} jour(s)</Text>
                      <Text style={styles.itemSous}>
                        {c.debut ? new Date(c.debut).toLocaleDateString('fr-FR') : ''} → {c.fin ? new Date(c.fin).toLocaleDateString('fr-FR') : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </ScrollView>
        </>
      )}

      {/* Modale : médicament */}
      {modaleMed ? (
        <View style={styles.modalVoile}>
          <View style={styles.modalCarte}>
            <Text style={styles.modalTitre}>Prescrire un médicament</Text>
            <Input label="Catalogue (disponibles uniquement pour interne)">
              <ListeSelect
                value={medForm.medicamentId}
                options={optionsMedicaments}
                placeholder="— Ou saisie libre ci-dessous —"
                onChange={(v) => setMedForm({ ...medForm, medicamentId: v as number })}
              />
            </Input>
            <Input label="Nom (saisie libre)" value={medForm.nom} onChangeText={(t) => setMedForm({ ...medForm, nom: t })} placeholder="Ex : Paracétamol 500 mg" />
            <ListeCombo label="Posologie *" value={medForm.posologie} options={listes.posologie ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => setMedForm({ ...medForm, posologie: v })} />
            <View style={styles.ligne}>
              <View style={styles.ligneItem}>
                <Input label={`Quantité à acheter (${uniteDuMedicament(medForm.medicamentId)}) *`} keyboardType="number-pad" value={medForm.quantite} onChangeText={(t) => setMedForm({ ...medForm, quantite: t })} placeholder="Ex : 2" />
              </View>
              <View style={styles.ligneItem}>
                <Input label="Durée" value={medForm.duree} onChangeText={(t) => setMedForm({ ...medForm, duree: t })} placeholder="4 jours" />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Btn title="Annuler" variant="outline" onPress={() => setModaleMed(false)} />
              <Btn title="Ajouter" onPress={ajouterMedicament} loading={medEnCours} />
            </View>
          </View>
        </View>
      ) : null}

      {/* Modale : prescription d'un soin */}
      <Modale
        visible={modaleSoin}
        titre="💉 Prescrire un soin"
        sousTitre={`Soit ${totalAdminSoin} administration(s) à confirmer par l'infirmier`}
        onFermer={() => setModaleSoin(false)}
        actions={
          <>
            <Btn title="Annuler" variant="outline" onPress={() => setModaleSoin(false)} />
            <Btn title="Prescrire" onPress={confirmerSoin} loading={soinEnCours} />
          </>
        }
      >
        <Input label="Type de soin *">
          <ListeSelect
            value={soinForm.typeSoinId}
            options={typesSoins}
            placeholder="— Choisir le type de soin —"
            onChange={(v) => setSoinForm({ ...soinForm, typeSoinId: v as number })}
          />
        </Input>
        <View style={styles.ligne}>
          <View style={styles.ligneItem}>
            <Input
              label="Fois par jour *"
              keyboardType="number-pad"
              value={soinForm.foisParJour}
              onChangeText={(t) => majRythmeSoin({ foisParJour: t })}
            />
          </View>
          <View style={styles.ligneItem}>
            <Input
              label="Durée (jours) *"
              keyboardType="number-pad"
              value={soinForm.dureeJours}
              onChangeText={(t) => majRythmeSoin({ dureeJours: t })}
            />
          </View>
        </View>

        <SectionTitle>Médicaments à administrer</SectionTitle>
        {consommables.length === 0 ? <Text style={styles.note}>Aucun médicament consommable disponible en stock.</Text> : null}
        {soinForm.lignes.map((l, i) => (
          <View key={i} style={styles.soinLigne}>
            <Input label="Médicament consommable *">
              <ListeSelect
                value={l.medicamentId}
                options={consommables}
                placeholder="— Choisir —"
                onChange={(v) => majLigneSoin(i, { medicamentId: v as number })}
              />
            </Input>
            <View style={styles.ligne}>
              <View style={styles.ligneItem}>
                <Input label="Quantité par prise *" value={l.dose} placeholder="1, 1/2" onChangeText={(t) => majLigneSoin(i, { dose: t })} />
              </View>
              <View style={styles.ligneItem}>
                <ListeCombo label="Unité" value={l.unite} options={UNITES_SOIN} placeholder="AMPOULE" onChange={(v) => majLigneSoin(i, { unite: v })} />
              </View>
            </View>
            <Input label="Voie">
              <ListeSelect
                value={l.voie}
                options={VOIES_SOIN}
                placeholder="— Choisir la voie —"
                onChange={(v) => majLigneSoin(i, { voie: v as string })}
              />
            </Input>
            <ListeCombo label="Posologie" value={l.posologie} options={listes.posologie ?? []} placeholder="— Choisir ou ajouter —" onChange={(v) => majLigneSoin(i, { posologie: v })} />
            <View style={styles.ligne}>
              <View style={styles.ligneItem}>
                <Input
                  label="À retirer à la pharmacie *"
                  keyboardType="number-pad"
                  value={l.quantitePharmacie}
                  onChangeText={(t) => majLigneSoin(i, { quantitePharmacie: t, quantiteManuelle: true })}
                />
              </View>
              <View style={[styles.ligneItem, { justifyContent: 'flex-end', paddingBottom: 12 }]}>
                <Btn title="✕ Retirer" small variant="danger" onPress={() => setSoinForm({ ...soinForm, lignes: soinForm.lignes.filter((_, j) => j !== i) })} />
              </View>
            </View>
          </View>
        ))}
        <Btn title="＋ Ajouter un médicament" small variant="outline" onPress={() => setSoinForm({ ...soinForm, lignes: [...soinForm.lignes, nouvelleLigneSoin(totalAdminSoin)] })} />
        <Input
          label="Instructions complémentaires"
          value={soinForm.instructions}
          onChangeText={(t) => setSoinForm({ ...soinForm, instructions: t })}
          placeholder="Ex : injecter lentement"
          multiline
        />
      </Modale>

      {/* Modale : détail d'une consultation passée (ce que le patient a reçu) */}
      <Modale
        visible={histoDetail !== null}
        titre={`📚 ${histoDetail?.passage?.numeroOrdre ?? '—'} — ${
          histoDetail ? new Date(histoDetail.createdAt ?? histoDetail.date).toLocaleDateString('fr-FR') : ''
        }`}
        onFermer={() => setHistoDetail(null)}
        actions={<Btn title="Fermer" variant="outline" onPress={() => setHistoDetail(null)} />}
      >
        {histoDetail ? (
          <>
            <Onglets
              actif={histoOnglet}
              onChange={(k) => setHistoOnglet(k as typeof histoOnglet)}
              tabs={[
                { key: 'consultation', label: '🩺 Consultation' },
                { key: 'labo', label: '🔬 Labo', count: (histoDetail.passage?.examensLabo ?? []).length + histoPrescrits('EXAMEN_LABO').length },
                {
                  key: 'imagerie',
                  label: '🩻 Imagerie',
                  count:
                    (histoDetail.passage?.examensImagerie ?? []).length +
                    (histoDetail.passage?.fichesExamenImagerie ?? []).length +
                    ((histoDetail.passage?.fichesExamenImagerie ?? []).length ? 0 : histoPrescrits('IMAGERIE').length),
                },
                { key: 'ordonnance', label: '💊 Ordonnance', count: (histoDetail.medicaments ?? []).length },
                { key: 'externes', label: '📎 Hors clinique', count: histoExternes.length },
              ]}
            />

            {histoOnglet === 'consultation' ? (
              <>
                <Text style={styles.syntheseTitre}>Constantes</Text>
                <Text style={styles.note}>
                  Poids {histoDetail.passage?.poids ?? '—'} kg · Taille {histoDetail.passage?.taille || '—'} cm · Temp. {histoDetail.passage?.temperature ?? '—'} °C ·
                  Pouls {histoDetail.passage?.pouls ?? '—'} · TA {histoDetail.passage?.tensionGauche || '—'} / {histoDetail.passage?.tensionDroite || '—'}
                </Text>
                <Text style={styles.syntheseTitre}>Antécédents</Text>
                <Text style={styles.note}>Traitement antérieur : {histoDetail.traitementAnterieur || '—'}</Text>
                <Text style={styles.note}>Antécédents médicaux : {histoDetail.antecedentsMedicaux || '—'}</Text>
                <Text style={styles.note}>Antécédents chirurgicaux : {histoDetail.antecedentsChirurgicaux || (histoDetail.chirurgie === false ? 'Non' : '—')}</Text>
                <Text style={styles.syntheseTitre}>Examen clinique</Text>
                <Text style={styles.note}>Motif : {histoDetail.motif || '—'}</Text>
                <Text style={styles.note}>Examen physique : {histoDetail.observation || '—'}</Text>
                <Text style={styles.note}>Autres examens demandés : {histoDetail.autresExamens || '—'}</Text>
                <Text style={styles.syntheseTitre}>Diagnostic</Text>
                <Text style={styles.note}>
                  <Text style={{ fontWeight: '800' }}>{histoDetail.diagnostic || '—'}</Text>
                </Text>
                <Text style={styles.note}>Pathologies associées : {histoDetail.pathologiesAssociees || '—'}</Text>
              </>
            ) : null}

            {histoOnglet === 'labo' ? (
              <>
                {(histoDetail.passage?.examensLabo ?? []).length + histoPrescrits('EXAMEN_LABO').length === 0 ? (
                  <Text style={styles.note}>Aucun examen de laboratoire pour ce passage.</Text>
                ) : null}
                {histoPrescrits('EXAMEN_LABO').map((l) => (
                  <View key={`p${l.id}`} style={styles.item}>
                    <Text style={styles.itemTitre}>🔬 {l.libelle}</Text>
                    <Text style={styles.itemSous}>
                      {l.statut === 'EN_ATTENTE' ? 'Prescrit — en attente de paiement' : 'Payé — en attente de réalisation'}
                    </Text>
                  </View>
                ))}
                {(histoDetail.passage?.examensLabo ?? []).map((e: any) => (
                  <View key={`l${e.id}`} style={styles.item}>
                    <Text style={styles.itemTitre}>
                      🔬 {e.libelle} — {e.statut === 'VALIDE' ? 'validé' : 'en cours'}
                    </Text>
                    {(e.lignes ?? []).map((lg: any) => (
                      <Text key={lg.id} style={styles.itemSous}>
                        {lg.parametre} : <Text style={{ fontWeight: '800' }}>{lg.valeur}</Text> {lg.unite} · normes {lg.normes ?? '—'}
                      </Text>
                    ))}
                    {e.conclusion ? <Text style={styles.itemSous}>Conclusion : {e.conclusion}</Text> : null}
                  </View>
                ))}
              </>
            ) : null}

            {histoOnglet === 'imagerie' ? (
              <>
                {(histoDetail.passage?.examensImagerie ?? []).length + (histoDetail.passage?.fichesExamenImagerie ?? []).length === 0 &&
                histoPrescrits('IMAGERIE').length === 0 ? (
                  <Text style={styles.note}>Aucun examen d'imagerie pour ce passage.</Text>
                ) : null}
                {(histoDetail.passage?.fichesExamenImagerie ?? []).length === 0
                  ? histoPrescrits('IMAGERIE').map((l) => (
                      <View key={`p${l.id}`} style={styles.item}>
                        <Text style={styles.itemTitre}>🩻 {l.libelle}</Text>
                        <Text style={styles.itemSous}>
                          {l.statut === 'EN_ATTENTE' ? 'Prescrit — en attente de paiement' : 'Payé — en attente de réalisation'}
                        </Text>
                      </View>
                    ))
                  : null}
                {(histoDetail.passage?.examensImagerie ?? []).map((e: any) => (
                  <View key={`i${e.id}`} style={styles.item}>
                    <Text style={styles.itemTitre}>
                      🩻 {e.libelle} — {e.statut === 'VALIDE' ? 'validé' : 'en cours'}
                    </Text>
                    {e.indication ? <Text style={styles.itemSous}>Indication : {e.indication}</Text> : null}
                    {e.resultat ? <Text style={styles.itemSous}>Résultat : {e.resultat}</Text> : null}
                    {e.conclusion ? <Text style={styles.itemSous}>Conclusion : {e.conclusion}</Text> : null}
                  </View>
                ))}
                {(histoDetail.passage?.fichesExamenImagerie ?? []).map((f: any) => (
                  <View key={`f${f.id}`} style={styles.item}>
                    <Text style={styles.itemTitre}>📄 {f.libelleType}</Text>
                    <Text style={styles.ficheTexte}>
                      {decouperValeurs(f.texte, f.valeurs).map((x, i) => (
                        <Text key={i} style={x.val ? styles.ficheValeur : undefined}>
                          {x.t}
                        </Text>
                      ))}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}

            {histoOnglet === 'ordonnance' ? (
              <>
                {(histoDetail.medicaments ?? []).length === 0 ? <Text style={styles.note}>💊 Aucun médicament prescrit.</Text> : null}
                {[...(histoDetail.ordonnances ?? []), { id: null, numero: null, statut: null }].map((o: any) => {
                  const meds = (histoDetail.medicaments ?? []).filter((m: any) =>
                    o.id ? m.ordonnanceId === o.id : !(histoDetail.ordonnances ?? []).some((x: any) => x.id === m.ordonnanceId),
                  )
                  if (!meds.length) return null
                  return (
                    <View key={o.id ?? 'sans'} style={styles.item}>
                      <Text style={styles.itemTitre}>
                        {o.numero ? `Ordonnance N° ${o.numero}` : 'Ordonnance'}
                        {o.statut ? ` — ${o.statut === 'TRAITEE' ? 'délivrée' : 'non délivrée'}` : ''}
                      </Text>
                      {meds.map((m: any) => (
                        <Text key={m.id} style={styles.itemSous}>
                          • <Text style={{ fontWeight: '800' }}>{m.medicamentNom ?? '—'}</Text>
                          {m.forme ? ` (${m.forme})` : ''} — {m.posologie ?? '—'} ({m.quantite ?? '—'}, {m.duree ?? '—'})
                        </Text>
                      ))}
                    </View>
                  )
                })}
              </>
            ) : null}

            {histoOnglet === 'externes' ? (
              <>
                {histoExternes.length === 0 ? <Text style={styles.note}>Aucun examen hors clinique pour ce passage.</Text> : null}
                {histoExternes.map((e: any) => (
                  <View key={e.id} style={[styles.item, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitre}>📎 {e.libelle}</Text>
                      {e.statut === 'EN_ATTENTE' ? <Text style={styles.itemSous}>Prescrit à la clinique, non réalisé ici</Text> : null}
                      {e.resultatExterne ? (
                        <Text style={styles.itemSous}>
                          {e.resultatExterne.dateExamen ? new Date(e.resultatExterne.dateExamen).toLocaleDateString('fr-FR') : '—'} ·{' '}
                          {e.resultatExterne.lieu || '—'}
                          {e.resultatExterne.conclusion ? ` · ${e.resultatExterne.conclusion}` : ''}
                        </Text>
                      ) : (
                        <Badge label="Non joint" tone="warning" />
                      )}
                    </View>
                    {e.resultatExterne ? (
                      <Btn title="👁️ Voir" small variant="outline" onPress={() => voirDocument(e.id, e.libelle)} />
                    ) : (
                      <Btn title="📎 Joindre" small onPress={() => joindreDepuisHistorique(e)} />
                    )}
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </Modale>

      {/* Modale : joindre la photo du résultat d'un examen fait hors clinique */}
      <Modale
        visible={ligneJoindre !== null}
        titre={`📎 Résultat — ${ligneJoindre?.libelle ?? ''}`}
        sousTitre="Photographiez le résultat rapporté par le patient (ou choisissez la photo dans la galerie)."
        onFermer={() => setLigneJoindre(null)}
        actions={
          <>
            <Btn title="Annuler" small variant="outline" onPress={() => setLigneJoindre(null)} />
            <Btn title="💾 Enregistrer" small onPress={enregistrerJoindre} loading={joindreEnCours} />
          </>
        }
      >
        {ligneJoindre?.statut === 'EN_ATTENTE' ? (
          <Text style={styles.note}>
            ℹ️ Cet examen était prescrit à la clinique : en joignant un résultat, il sera marqué « fait hors clinique » et ne sera plus à payer à la caisse.
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn title="📷 Prendre une photo" variant="outline" onPress={() => choisirPhoto('camera')} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title="🖼️ Galerie" variant="outline" onPress={() => choisirPhoto('galerie')} />
          </View>
        </View>
        {formJoindre.contenu ? (
          <Image source={{ uri: formJoindre.contenu }} style={styles.apercuPhoto} resizeMode="contain" />
        ) : ligneJoindre?.resultatExterne ? (
          <Text style={styles.note}>Document actuel : {ligneJoindre.resultatExterne.nomFichier} (gardé si aucune nouvelle photo)</Text>
        ) : null}
        <DateField label="Date de l'examen" value={formJoindre.dateExamen} onChange={(v) => setFormJoindre({ ...formJoindre, dateExamen: v })} />
        <Input label="Réalisé à (laboratoire, centre…)" value={formJoindre.lieu} onChangeText={(t) => setFormJoindre({ ...formJoindre, lieu: t })} />
        <Input label="Conclusion" value={formJoindre.conclusion} onChangeText={(t) => setFormJoindre({ ...formJoindre, conclusion: t })} multiline />
      </Modale>

      {/* Visionneuse du document joint */}
      <Modale
        visible={documentVu !== null}
        titre={`📎 ${documentVu?.libelle ?? ''}`}
        sousTitre={[
          documentVu?.dateExamen ? `Examen du ${new Date(documentVu.dateExamen).toLocaleDateString('fr-FR')}` : '',
          documentVu?.lieu ?? '',
        ]
          .filter(Boolean)
          .join(' · ')}
        onFermer={() => setDocumentVu(null)}
        actions={
          <>
            <Btn title="🗑️ Supprimer" small variant="danger" onPress={supprimerDocument} />
            <Btn title="Fermer" small variant="outline" onPress={() => setDocumentVu(null)} />
          </>
        }
      >
        {documentVu?.conclusion ? <Text style={styles.note}>Conclusion : {documentVu.conclusion}</Text> : null}
        {documentVu?.typeMime?.startsWith('image/') ? (
          <Image source={{ uri: documentVu.contenu }} style={styles.documentImage} resizeMode="contain" />
        ) : documentVu ? (
          <Text style={styles.note}>
            Document PDF ({documentVu.nomFichier}) : il s'ouvre et s'imprime depuis la version web.
          </Text>
        ) : null}
      </Modale>

      {/* Modale : résultat d'examen (labo / imagerie) */}
      <Modale
        visible={resultatVisible}
        titre={`📋 Résultat — ${resultatCourant?.exam?.libelle ?? resultatCourant?.libelle ?? ''}`}
        onFermer={() => setResultatVisible(false)}
        actions={<Btn title="Fermer" variant="outline" onPress={() => setResultatVisible(false)} />}
      >
        {resultatCourant?.type === 'LABO' ? (
          <>
            {(resultatCourant.exam.lignes ?? []).map((lg: any, i: number) => (
              <View key={i} style={styles.item}>
                <Text style={styles.itemTitre}>
                  {lg.parametre ?? '—'} : <Text style={{ fontWeight: '800' }}>{lg.valeur ?? '—'}</Text>{' '}
                  {lg.unite ?? ''}
                </Text>
                <Text style={styles.itemSous}>Normes : {lg.normes ?? '—'}</Text>
              </View>
            ))}
            <Text style={styles.note}>
              <Text style={{ fontWeight: '800' }}>Conclusion : </Text>
              {resultatCourant.exam.conclusion ?? '—'}
            </Text>
          </>
        ) : (
          <>
            {resultatCourant?.exam ? (
              <>
                <InfoLigne label="Indication" value={resultatCourant.exam.indication ?? '—'} />
                <InfoLigne label="Technique" value={resultatCourant.exam.technique ?? '—'} />
                <InfoLigne label="Résultat" value={resultatCourant.exam.resultat ?? '—'} />
                <InfoLigne label="Conclusion" value={resultatCourant.exam.conclusion ?? '—'} />
              </>
            ) : null}
            {fichesPassage.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <SectionTitle>📄 Fiches d'échographie du passage</SectionTitle>
                {fichesPassage.map((f: any) => (
                  <View key={f.id} style={styles.item}>
                    <Text style={styles.itemTitre}>
                      {f.libelleType} — {new Date(f.createdAt).toLocaleDateString('fr-FR')}
                    </Text>
                    {f.medecin?.personnel ? (
                      <Text style={styles.itemSous}>
                        Dr {f.medecin.personnel.nom} {f.medecin.personnel.prenom}
                      </Text>
                    ) : null}
                    <Text style={styles.ficheTexte}>
                      {decouperValeurs(f.texte, f.valeurs).map((s, i) => (
                        <Text key={i} style={s.val ? styles.ficheValeur : undefined}>
                          {s.t}
                        </Text>
                      ))}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
        {resultatCourant?.exam?.valideLe ? (
          <Text style={styles.note}>
            Validé le {new Date(resultatCourant.exam.valideLe).toLocaleString('fr-FR')}
            {resultatCourant.exam.validePar?.personnel
              ? ` par ${resultatCourant.exam.validePar.personnel.prenom ?? ''} ${resultatCourant.exam.validePar.personnel.nom ?? ''}`
              : ''}
          </Text>
        ) : null}
      </Modale>
    </Screen>
  )
}

const styles = StyleSheet.create({
  ordoPuces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  ordoPuce: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: '#c9ece5', backgroundColor: colors.surface },
  ordoPuceActive: { borderColor: colors.primary, backgroundColor: '#d9f2e8' },
  ordoPuceTexte: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  ordoPuceTexteActif: { color: colors.primaryDarker },
  ordoNouvelle: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary },
  ordoNouvelleTexte: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  syntheseTitre: { fontSize: 13, fontWeight: '800', color: colors.primaryDarker, marginTop: 10, marginBottom: 2 },
  apercuPhoto: { width: '100%', height: 220, marginBottom: 10, backgroundColor: '#0f172a', borderRadius: 10 },
  documentImage: { width: '100%', height: 460, backgroundColor: '#0f172a', borderRadius: 10 },
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
  ficheTitre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  ficheNom: { fontSize: 16, fontWeight: '800', color: colors.primaryDarker },
  ficheSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, marginBottom: 4 },
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
  ongletTexte: { fontWeight: '700', color: colors.textMuted, fontSize: 12.5 },
  ongletTexteActif: { color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipActif: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTexte: { fontWeight: '700', fontSize: 13, color: colors.textMuted },
  chipTexteActif: { color: '#fff' },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
  note: { fontSize: 12, color: colors.textMuted, marginTop: 8, marginBottom: 6 },
  ficheTexte: { fontSize: 13, lineHeight: 19, color: colors.text, marginTop: 6 },
  ficheValeur: { fontWeight: '800' },
  ligne: { flexDirection: 'row', gap: 10 },
  soinLigne: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  ligneItem: { flex: 1 },
  ligneDispo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
  ligneMed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  medNom: { fontSize: 14, fontWeight: '700', color: colors.text },
  medDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
    maxHeight: '90%',
  },
  modalTitre: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14 },
})
