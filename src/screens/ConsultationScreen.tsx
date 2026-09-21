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
import { ApercuTexte, Badge, Btn, Card, Input, Screen, SectionTitle } from '../components/ui'
import ListeSelect from '../components/ListeSelect'

/** Groupe de choix façon « chips » (équivalent des cases à cocher du web). */
function Chips({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string | null
  onChange: (v: string) => void
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <TouchableOpacity
          key={o}
          style={[styles.chip, value === o && styles.chipActif]}
          onPress={() => onChange(o)}
        >
          <Text style={[styles.chipTexte, value === o && styles.chipTexteActif]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

type PassageRef = {
  id: number
  numeroOrdre: string
  statut: string
  consultable: boolean
  patient: { nom: string; prenom: string; code?: string; age?: string; sexe?: string }
  service?: { nom: string }
}

export default function ConsultationScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1

  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PassageRef[]>([])
  const [passage, setPassage] = useState<PassageRef | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [onglet, setOnglet] = useState<'fiche' | 'medicaments' | 'examens' | 'historique'>('fiche')

  // Fiche
  const [fiche, setFiche] = useState<any>({})
  const [saving, setSaving] = useState(false)

  // Médicaments
  const [medicaments, setMedicaments] = useState<any[]>([])
  const [prestations, setPrestations] = useState<any[]>([])
  const [modaleMed, setModaleMed] = useState(false)
  const [medForm, setMedForm] = useState({ medicamentId: null as number | null, nom: '', posologie: '', quantite: '', duree: '' })
  const [medEnCours, setMedEnCours] = useState(false)

  // Examens
  const [nouvelExamenId, setNouvelExamenId] = useState<number | null>(null)
  const [nouvelExamenLibre, setNouvelExamenLibre] = useState('')
  const [examenEnCours, setExamenEnCours] = useState(false)

  // Lits libres (hospitalisation)
  const [lits, setLits] = useState<any[]>([])
  const [filtreHisto, setFiltreHisto] = useState<'aujourdhui' | 'tout'>('aujourdhui')

  // Impression ordonnance
  const [ordoApercu, setOrdoApercu] = useState<string | null>(null)

  const consultation = detail?.passage?.consultation ?? null
  const historique = detail?.historique ?? []
  const estInterne = passage?.statut !== 'EXTERNE' && detail?.passage?.typePatient !== 'EXTERNE'

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
    setPassage(p)
    setResultats([])
    setOnglet('fiche')
    await chargerDetail(p.id)
  }

  async function chargerDetail(passageId: number) {
    try {
      const { data } = await http.get(`/consultations/passages/${passageId}`)
      setDetail(data)
      const c = data.passage.consultation
      if (c) {
        setFiche({
          motif: c.motif ?? '',
          observation: c.observation ?? '',
          diagnostic: c.diagnostic ?? '',
          modeEntree: c.modeEntree ?? '',
          hta: c.hta, diabete: c.diabete, tabac: c.tabac, alcool: c.alcool,
          grossesseEnCours: c.grossesseEnCours,
          traitementAnterieur: c.traitementAnterieur ?? '',
          antecedentsMedicaux: c.antecedentsMedicaux ?? '',
          antecedentsChirurgicaux: c.antecedentsChirurgicaux ?? '',
          profession: c.profession ?? '',
          nationalite: c.nationalite ?? '',
          telephone: c.telephone ?? '',
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
        hta: fiche.hta,
        diabete: fiche.diabete,
        tabac: fiche.tabac,
        alcool: fiche.alcool,
        grossesseEnCours: fiche.grossesseEnCours,
        traitementAnterieur: vider(fiche.traitementAnterieur),
        antecedentsMedicaux: vider(fiche.antecedentsMedicaux),
        antecedentsChirurgicaux: vider(fiche.antecedentsChirurgicaux),
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
        },
      }
      await http.post(`/consultations/passages/${passage.id}`, payload)
      Alert.alert('✅ Fiche enregistrée')
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
            await chargerDetail(passage!.id)
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
            <Btn title="✕" small variant="outline" onPress={() => { setPassage(null); setDetail(null); setOrdoApercu(null) }} />
          </View>

          {/* Onglets */}
          <View style={styles.onglets}>
            {(['fiche', 'medicaments', 'examens', 'historique'] as const).map((o) => (
              <TouchableOpacity key={o} style={[styles.onglet, onglet === o && styles.ongletActif]} onPress={() => setOnglet(o)}>
                <Text style={[styles.ongletTexte, onglet === o && styles.ongletTexteActif]}>
                  {o === 'fiche' ? 'Fiche' : o === 'medicaments' ? 'Médicaments' : o === 'examens' ? 'Examens' : 'Historique'}
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
                  <Input label="Traitement antérieur" value={fiche.traitementAnterieur ?? ''} onChangeText={(t) => setFiche({ ...fiche, traitementAnterieur: t })} />
                  <Input label="Antécédents médicaux" value={fiche.antecedentsMedicaux ?? ''} onChangeText={(t) => setFiche({ ...fiche, antecedentsMedicaux: t })} />
                  <Input label="Antécédents chirurgicaux" value={fiche.antecedentsChirurgicaux ?? ''} onChangeText={(t) => setFiche({ ...fiche, antecedentsChirurgicaux: t })} />
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
                  <Input label="Conduite à tenir / traitement" value={fiche.conduiteTenir ?? ''} onChangeText={(t) => setFiche({ ...fiche, conduiteTenir: t })} multiline />
                </Card>
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
            ) : onglet === 'examens' ? (
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
                    {l.statut === 'NON_PRESCRITE' && consultation ? (
                      <Btn title="✍️ Prescrire" small variant="outline" onPress={() => prescrireExamen(l)} />
                    ) : null}
                    {(l.statut === 'EN_ATTENTE' || l.statut === 'EXTERNE') && consultation ? (
                      <Btn title="✕" small variant="danger" onPress={() => retirerExamen(l)} />
                    ) : null}
                  </View>
                ))}
              </Card>
            ) : (
              <Card>
                <SectionTitle>Historique médical</SectionTitle>
                <View style={styles.chips}>
                  <TouchableOpacity
                    style={[styles.chip, filtreHisto === 'aujourdhui' && styles.chipActif]}
                    onPress={() => setFiltreHisto('aujourdhui')}
                  >
                    <Text style={[styles.chipTexte, filtreHisto === 'aujourdhui' && styles.chipTexteActif]}>Aujourd'hui</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, filtreHisto === 'tout' && styles.chipActif]}
                    onPress={() => setFiltreHisto('tout')}
                  >
                    <Text style={[styles.chipTexte, filtreHisto === 'tout' && styles.chipTexteActif]}>Tout</Text>
                  </TouchableOpacity>
                </View>
                {historique
                  .filter((h: any) =>
                    filtreHisto === 'aujourdhui'
                      ? new Date(h.createdAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
                      : true,
                  )
                  .map((h: any) => (
                    <View key={h.id} style={styles.ligneMed}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.medNom}>{h.passage?.numeroOrdre} · {new Date(h.createdAt).toLocaleDateString('fr-FR')}</Text>
                        {h.diagnostic ? <Text style={styles.medDetail}>Diagnostic : {h.diagnostic}</Text> : null}
                        {h.medicaments?.length ? (
                          <Text style={styles.medDetail}>💊 {h.medicaments.map((m: any) => m.medicamentNom).join(', ')}</Text>
                        ) : null}
                      </View>
                      <Badge label={h.statut === 'VALIDEE' ? 'Validée' : 'En cours'} tone={h.statut === 'VALIDEE' ? 'success' : 'warning'} />
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
    maxHeight: '90%',
  },
  modalTitre: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14 },
})
