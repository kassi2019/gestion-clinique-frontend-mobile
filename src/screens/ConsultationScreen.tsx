import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
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
import { ApercuTexte, Badge, Btn, Card, Chips, InfoLigne, Input, Modale, Screen, SectionTitle } from '../components/ui'
import ListeSelect from '../components/ListeSelect'

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
  const [onglet, setOnglet] = useState<'fiche' | 'medicaments' | 'examens'>('fiche')

  // Fiche
  const [fiche, setFiche] = useState<any>({})
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

  async function ajouterMedicamentFiche() {
    if (!consultation) return
    if (!ficheMedId && !ficheMedNom.trim()) {
      Alert.alert('Médicament', 'Choisissez un médicament du catalogue ou saisissez un nom.')
      return
    }
    setFicheMedEnCours(true)
    try {
      await http.post(`/consultations/${consultation.id}/medicaments`, {
        medicamentId: ficheMedId ?? undefined,
        nom: ficheMedNom.trim() || undefined,
        posologie: ficheMedPoso || undefined,
        quantite: ficheMedQte || undefined,
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
  const [nouvelExamenLibre, setNouvelExamenLibre] = useState('')
  const [examenEnCours, setExamenEnCours] = useState(false)

  // Lits libres (hospitalisation)
  const [lits, setLits] = useState<any[]>([])

  // Impression ordonnance
  const [ordoApercu, setOrdoApercu] = useState<string | null>(null)

  const consultation = detail?.passage?.consultation ?? null
  const historique = detail?.historique ?? []
  const estInterne = passage?.statut !== 'EXTERNE' && detail?.passage?.typePatient !== 'EXTERNE'

  // IMC calculé automatiquement à partir des constantes de l'accueil
  // (taille en cm côté accueil → conversion en mètres).
  const poidsKg = Number(detail?.passage?.poids)
  const tailleCm = Number(detail?.passage?.taille)
  const imcCalcule = poidsKg && tailleCm ? (poidsKg / Math.pow(tailleCm / 100, 2)).toFixed(1) : ''

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
  async function chargerFileMedecin() {
    if (!estMedecin) return
    setChargementFile(true)
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
    if (estMedecin && !passage) chargerFileMedecin()
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
          traitementAnterieur: c.traitementAnterieur ?? '',
          antecedentsMedicaux: c.antecedentsMedicaux ?? '',
          antecedentsChirurgicaux: c.antecedentsChirurgicaux ?? '',
          pathologiesAssociees: c.pathologiesAssociees ?? '',
          typeSuivi: c.typeSuivi ?? '',
          consultantType: c.consultantType ?? '',
          imc: c.imc ?? '',
          zscore: c.zscore ?? '',
          frequenceRespiratoire: c.frequenceRespiratoire ?? '',
          perimetreBrachial: c.perimetreBrachial ?? '',
          perimetreCranien: c.perimetreCranien ?? '',
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
          residenceHabituelle: pc.residenceHabituelle ?? '',
          residenceActuelle: pc.residenceActuelle ?? '',
          hospitalisation: c.hospitalisation ?? false,
          hospitalisationDuree: c.hospitalisationDuree ?? '',
          issueSortie: c.issueSortie ?? '',
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
  }

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
        grossesseEnCours: fiche.grossesseEnCours,
        ddr: vider(fiche.ddr),
        traitementAnterieur: vider(fiche.traitementAnterieur),
        antecedentsMedicaux: vider(fiche.antecedentsMedicaux),
        antecedentsChirurgicaux: vider(fiche.antecedentsChirurgicaux),
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
        autresExamens: vider(fiche.autresExamens),
        casPresumeTB: fiche.casPresumeTB,
        moDureeHeures: vider(fiche.moDureeHeures),
        moDureeMinutes: vider(fiche.moDureeMinutes),
        moDebut: vider(fiche.moDebut),
        moFin: vider(fiche.moFin),
        hospitalisation: fiche.hospitalisation,
        hospitalisationDuree: vider(fiche.hospitalisationDuree),
        typeHospitalisation: vider(fiche.typeHospitalisation),
        hospitalisationDureeJours: fiche.hospitalisationDureeJours ?? undefined,
        litId: fiche.litId ?? undefined,
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
      await chargerDetail(passage.id)
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
    setMedEnCours(true)
    try {
      await http.post(`/consultations/${consultation.id}/medicaments`, {
        medicamentId: medForm.medicamentId ?? undefined,
        nom: medForm.nom.trim() || undefined,
        posologie: medForm.posologie || undefined,
        quantite: medForm.quantite || undefined,
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

  async function imprimerOrdonnance() {
    if (!consultation) return
    try {
      const { data } = await http.post(`/impression/consultations/${consultation.id}`)
      setOrdoApercu(data.contenu ?? 'Ordonnance imprimée au poste.')
      Alert.alert('🖨️ Ordonnance', data.ok ? 'Envoyée à l\'imprimante du poste.' : 'Impression non configurée — aperçu affiché.')
    } catch {
      Alert.alert('Erreur', 'Impression impossible.')
    }
  }

  // ── Examens ──
  const optionsExamens = useMemo(() => {
    const deja = new Set((detail?.passage?.prestations ?? []).map((l: any) => l.prestationId).filter(Boolean))
    return prestations
      .filter((p) => p.actif && p.type !== 'CONSULTATION' && !deja.has(p.id))
      .map((p) => ({ value: p.id, label: p.libelle }))
  }, [prestations, detail])

  /** Un examen est « déjà fait » si le service concerné l'a validé. */
  function estFait(l: any): boolean {
    const labo = (detail?.passage?.examensLabo ?? []).find((e: any) => e.passagePrestationId === l.id)
    const ima = (detail?.passage?.examensImagerie ?? []).find((e: any) => e.passagePrestationId === l.id)
    return labo?.statut === 'VALIDE' || ima?.statut === 'VALIDE'
  }

  // ── Résultats des examens (visibles par le médecin) ──
  const [resultatVisible, setResultatVisible] = useState(false)
  const [resultatCourant, setResultatCourant] = useState<{ type: 'LABO' | 'IMAGERIE'; exam: any } | null>(null)

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
            placeholder="Rechercher par code patient ou N° d'ordre…"
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
                  {chargementFile ? <Text style={styles.vide}>Chargement…</Text> : null}
                  {!chargementFile && fileMedecin.enAttente.length === 0 ? (
                    <Text style={styles.vide}>
                      {disponibilite === 'DISPONIBLE'
                        ? 'Aucun patient en attente pour le moment.'
                        : 'Vous êtes indisponible : devenez disponible pour recevoir des patients.'}
                    </Text>
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
                    <Text style={styles.vide}>Aucune consultation terminée aujourd'hui.</Text>
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
            {(['fiche', 'medicaments', 'examens'] as const).map((o) => (
              <TouchableOpacity key={o} style={[styles.onglet, onglet === o && styles.ongletActif]} onPress={() => setOnglet(o)}>
                <Text style={[styles.ongletTexte, onglet === o && styles.ongletTexteActif]}>
                  {o === 'fiche' ? 'Fiche' : o === 'medicaments' ? 'Médicaments' : 'Examens'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {onglet === 'fiche' ? (
              <>
                <Card>
                  <SectionTitle>Consultation</SectionTitle>
                  <Input label="Motif" value={fiche.motif ?? ''} onChangeText={(t) => setFiche({ ...fiche, motif: t })} />
                  <Input label="Examen physique (observation)" value={fiche.observation ?? ''} onChangeText={(t) => setFiche({ ...fiche, observation: t })} multiline />
                  <Input label="Diagnostic" value={fiche.diagnostic ?? ''} onChangeText={(t) => setFiche({ ...fiche, diagnostic: t })} multiline />
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
                  <Text style={styles.label}>Grossesse en cours</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.grossesseEnCours == null ? null : fiche.grossesseEnCours ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, grossesseEnCours: v === 'Oui' })} />
                  <Input label="DDR (date des dernières règles)" value={fiche.ddr ?? ''} onChangeText={(t) => setFiche({ ...fiche, ddr: t })} placeholder="AAAA-MM-JJ" />
                  <Input label="Traitement antérieur" value={fiche.traitementAnterieur ?? ''} onChangeText={(t) => setFiche({ ...fiche, traitementAnterieur: t })} />
                  <Input label="Antécédents médicaux" value={fiche.antecedentsMedicaux ?? ''} onChangeText={(t) => setFiche({ ...fiche, antecedentsMedicaux: t })} />
                  <Input label="Antécédents chirurgicaux" value={fiche.antecedentsChirurgicaux ?? ''} onChangeText={(t) => setFiche({ ...fiche, antecedentsChirurgicaux: t })} />
                  <Input label="Pathologies associées" value={fiche.pathologiesAssociees ?? ''} onChangeText={(t) => setFiche({ ...fiche, pathologiesAssociees: t })} />
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
                  <Chips options={['Oui', 'Non']} value={fiche.rechercheTB == null ? null : fiche.rechercheTB ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, rechercheTB: v === 'Oui' })} />
                  <Text style={styles.label}>Cas présumé TB</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.casPresumeTB == null ? null : fiche.casPresumeTB ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, casPresumeTB: v === 'Oui' })} />
                  <Text style={styles.label}>TDR paludisme</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.tdrPaludisme == null ? null : fiche.tdrPaludisme ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, tdrPaludisme: v === 'Oui' })} />
                  <Text style={styles.label}>Goutte épaisse</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.goutteEpaisse == null ? null : fiche.goutteEpaisse ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, goutteEpaisse: v === 'Oui' })} />
                  <Text style={styles.label}>MILDA éligible</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.mildaEligible == null ? null : fiche.mildaEligible ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, mildaEligible: v === 'Oui' })} />
                  <Text style={styles.label}>MILDA remise</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.mildaRemise == null ? null : fiche.mildaRemise ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, mildaRemise: v === 'Oui' })} />
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
                  <Input label="Autres examens" value={fiche.autresExamens ?? ''} onChangeText={(t) => setFiche({ ...fiche, autresExamens: t })} />
                </Card>
                <Card>
                  <SectionTitle>Données administratives</SectionTitle>
                  <View style={styles.ligne}>
                    <View style={styles.ligneItem}>
                      <Input label="Profession" value={fiche.profession ?? ''} onChangeText={(t) => setFiche({ ...fiche, profession: t })} />
                    </View>
                    <View style={styles.ligneItem}>
                      <Input label="Nationalité" value={fiche.nationalite ?? ''} onChangeText={(t) => setFiche({ ...fiche, nationalite: t })} />
                    </View>
                  </View>
                  <Input label="Scolarisation" value={fiche.scolarisation ?? ''} onChangeText={(t) => setFiche({ ...fiche, scolarisation: t })} />
                  <Input label="Statut conjugal" value={fiche.statutConjugal ?? ''} onChangeText={(t) => setFiche({ ...fiche, statutConjugal: t })} />
                  <Input label="Type de population" value={fiche.typePopulation ?? ''} onChangeText={(t) => setFiche({ ...fiche, typePopulation: t })} />
                  <Input label="Protection sociale" value={fiche.protectionSociale ?? ''} onChangeText={(t) => setFiche({ ...fiche, protectionSociale: t })} />
                  <Input label="Populations à risque" value={fiche.populationsRisque ?? ''} onChangeText={(t) => setFiche({ ...fiche, populationsRisque: t })} />
                  <Input label="Résidence habituelle" value={fiche.residenceHabituelle ?? ''} onChangeText={(t) => setFiche({ ...fiche, residenceHabituelle: t })} />
                  <Input label="Résidence actuelle" value={fiche.residenceActuelle ?? ''} onChangeText={(t) => setFiche({ ...fiche, residenceActuelle: t })} />
                </Card>
                <Card>
                  <SectionTitle>Hospitalisation</SectionTitle>
                  <Text style={styles.label}>Hospitaliser le patient ?</Text>
                  <Chips options={['Oui', 'Non']} value={fiche.hospitalisation ? 'Oui' : 'Non'} onChange={(v) => setFiche({ ...fiche, hospitalisation: v === 'Oui' })} />
                  {fiche.hospitalisation ? (
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
                  {/* Prescription de médicaments intégrée à la fiche (§ cahier des charges) */}
                  {(consultation?.medicaments ?? []).map((p: any) => (
                    <View key={p.id} style={styles.ligneMed}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.medNom}>{p.medicamentNom}</Text>
                        <Text style={styles.medDetail}>
                          {[p.posologie, p.quantite, p.duree].filter(Boolean).join(' · ') || '—'}
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
                  <View style={styles.ligne}>
                    <View style={styles.ligneItem}>
                      <Input label="Posologie" value={ficheMedPoso} onChangeText={setFicheMedPoso} placeholder="Ex : 1 cp 3x/j" />
                    </View>
                    <View style={styles.ligneItem}>
                      <Input label="Quantité" value={ficheMedQte} onChangeText={setFicheMedQte} placeholder="Ex : 2 boîtes" />
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
                </Card>
                <Card>
                  <SectionTitle>Issue de la consultation</SectionTitle>
                  <Chips
                    options={['Hospitalisé(e)', 'M.O.', 'Référé(e) en interne', 'Référé(e) externe']}
                    value={
                      fiche.issueSortie === 'HOSPITALISE'
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
                          v === 'Hospitalisé(e)'
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
                    </>
                  ) : null}
                </Card>
                {historique.length > 0 ? (
                  <Card>
                    <SectionTitle>Historique médical</SectionTitle>
                    {historique.map((h: any, i: number) => (
                      <View key={i} style={styles.item}>
                        <Text style={styles.itemTitre}>
                          {new Date(h.createdAt ?? h.date).toLocaleDateString('fr-FR')} · {h.diagnostic ?? 'Consultation'}
                        </Text>
                        <Text style={styles.itemSous}>{h.motif ?? ''}</Text>
                      </View>
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
                      {(consultation.medicaments ?? []).map((p: any) => (
                        <View key={p.id} style={styles.ligneMed}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.medNom}>
                              {p.medicamentNom}
                              {p.forme ? ` (${p.forme})` : ''}
                            </Text>
                            <Text style={styles.medDetail}>
                              {[p.posologie, p.quantite, p.duree].filter(Boolean).join(' · ') || '—'}
                            </Text>
                          </View>
                          <Btn title="✕" small variant="danger" onPress={() => retirerMedicament(p.id)} />
                        </View>
                      ))}
                      <Btn
                        title="＋ Ajouter un médicament"
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
                    <Text style={styles.vide}>Enregistrez d'abord la fiche de consultation.</Text>
                  )}
                </Card>
                {ordoApercu ? <ApercuTexte contenu={ordoApercu} /> : null}
              </>
            ) : (
              <Card>
                <SectionTitle>Examens (laboratoire / imagerie)</SectionTitle>
                {consultation ? (
                  <>
                    <Input label="Examen du catalogue">
                      <ListeSelect value={nouvelExamenId} options={optionsExamens} placeholder="— Choisir un examen —" onChange={(v) => setNouvelExamenId(v as number)} />
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
                    {resultatExamen(l) ? (
                      <Btn
                        title="📋 Résultat"
                        small
                        variant="outline"
                        onPress={() => {
                          setResultatCourant(resultatExamen(l))
                          setResultatVisible(true)
                        }}
                      />
                    ) : null}
                    {l.statut === 'NON_PRESCRITE' && consultation ? (
                      <Btn title="✍️ Prescrire" small variant="outline" onPress={() => prescrireExamen(l)} />
                    ) : null}
                    {(l.statut === 'EN_ATTENTE' || l.statut === 'EXTERNE') && consultation ? (
                      <Btn title="✕" small variant="danger" onPress={() => retirerExamen(l)} />
                    ) : null}
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
            <Input label="Posologie" value={medForm.posologie} onChangeText={(t) => setMedForm({ ...medForm, posologie: t })} placeholder="1 comprimé 3x/j" />
            <View style={styles.ligne}>
              <View style={styles.ligneItem}>
                <Input label="Quantité" value={medForm.quantite} onChangeText={(t) => setMedForm({ ...medForm, quantite: t })} placeholder="12" />
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

      {/* Modale : résultat d'examen (labo / imagerie) */}
      <Modale
        visible={resultatVisible}
        titre={`📋 Résultat — ${resultatCourant?.exam.libelle ?? ''}`}
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
            <InfoLigne label="Indication" value={resultatCourant?.exam.indication ?? '—'} />
            <InfoLigne label="Technique" value={resultatCourant?.exam.technique ?? '—'} />
            <InfoLigne label="Résultat" value={resultatCourant?.exam.resultat ?? '—'} />
            <InfoLigne label="Conclusion" value={resultatCourant?.exam.conclusion ?? '—'} />
          </>
        )}
        {resultatCourant?.exam.valideLe ? (
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
  ligne: { flexDirection: 'row', gap: 10 },
  ligneItem: { flex: 1 },
  ligneDispo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
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
