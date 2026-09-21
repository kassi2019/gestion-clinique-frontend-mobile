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
import { ApercuTexte, Badge, Btn, Card, Input, Screen, SectionTitle } from '../components/ui'
import ListeSelect from '../components/ListeSelect'

type Patient = { id: number; nom: string; prenom: string; code: string; age?: string; sexe?: string }
type Service = { id: number; nom: string }
type Prestation = { id: number; libelle: string; type: string; montant: number; actif: boolean; serviceId: number }
type PassageJour = {
  id: number
  numeroOrdre: string
  statut: string
  patient: { nom: string; prenom: string }
  service?: { nom: string }
  taille?: string
  temperature?: number | null
  pouls?: number | null
  tensionGauche?: string
  tensionDroite?: string
  poids?: number | null
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
  const [sexe, setSexe] = useState('')
  const [telephone, setTelephone] = useState('')
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
  const [rechercheJour, setRechercheJour] = useState('')
  const [chargementListe, setChargementListe] = useState(false)

  // Constantes
  const [filtreConstantes, setFiltreConstantes] = useState<'NON' | 'OUI'>('NON')
  const [passagesConstantes, setPassagesConstantes] = useState<PassageJour[]>([])
  const [chargementConstantes, setChargementConstantes] = useState(false)
  const [constanteCible, setConstanteCible] = useState<PassageJour | null>(null)
  const [formConst, setFormConst] = useState({ taille: '', temperature: '', pouls: '', tensionGauche: '', tensionDroite: '', poids: '' })
  const [savingConst, setSavingConst] = useState(false)

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

  async function chargerJour(p = 1) {
    setChargementListe(true)
    try {
      const { data } = await http.get('/accueil/passages', {
        params: {
          cliniqueId,
          search: rechercheJour.trim() || undefined,
          page: p,
          perPage: 20,
        },
      })
      setPassages(data.data ?? [])
      setPage(p)
    } catch {
      setPassages([])
    } finally {
      setChargementListe(false)
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
    })
  }

  async function enregistrerConstantes() {
    if (!constanteCible) return
    setSavingConst(true)
    try {
      await http.patch(`/accueil/passages/${constanteCible.id}`, {
        taille: formConst.taille || undefined,
        temperature: formConst.temperature ? Number(formConst.temperature) : undefined,
        pouls: formConst.pouls ? Number(formConst.pouls) : undefined,
        tensionGauche: formConst.tensionGauche || undefined,
        tensionDroite: formConst.tensionDroite || undefined,
        poids: formConst.poids ? Number(formConst.poids) : undefined,
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
        motif: undefined,
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
          sexe: sexe || undefined,
          telephone: telephone || undefined,
        }
      }
      const { data } = await http.post('/accueil/passages', payload)
      Alert.alert(
        '✅ Passage créé',
        `N° d'ordre : ${data.numeroOrdre}\nPatient : ${data.patient?.nom ?? ''} ${data.patient?.prenom ?? ''}\nCode patient : ${data.patient?.code ?? ''}`,
      )
      await imprimerTicket(data.id, data.numeroOrdre)
      // Réinitialiser
      setNom(''); setPrenom(''); setAge(''); setSexe(''); setTelephone('')
      setPatientChoisi(null); setRecherchePatient(''); setResultatsPatients([])
      setServiceId(null); setTypePatient('INTERNE'); setReferent(''); setPrestationDemandee('')
      setConsultationId(null); setActePrestationId(null)
      chargerJour(1)
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Enregistrement impossible.')
    } finally {
      setSaving(false)
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
        <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <View style={styles.bandeauTitre}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titre}>🏥 Accueil</Text>
            <Text style={styles.sousTitre}>{user?.clinique?.nom ?? 'Gestion Clinique'}</Text>
          </View>
          {peutBasculer ? (
            <TouchableOpacity style={styles.btnBasculer} onPress={basculerPoste}>
              <Text style={styles.btnBasculerTexte}>
                ⚡ Basculer vers {posteConstante ? 'Enregistrement' : 'Constante'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Onglets (masqués sur le poste CONSTANTE) */}
      {!posteConstante ? (
        <View style={styles.onglets}>
          {(['nouveau', 'jour', 'constantes'] as const).map((o) => (
            <TouchableOpacity
              key={o}
              style={[styles.onglet, onglet === o && styles.ongletActif]}
              onPress={() => {
                setOnglet(o)
                if (o === 'constantes') chargerConstantes()
                if (o === 'jour') chargerJour(1)
              }}
            >
              <Text style={[styles.ongletTexte, onglet === o && styles.ongletTexteActif]}>
                {o === 'nouveau' ? 'Nouveau passage' : o === 'jour' ? 'Passages du jour' : 'Constantes'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {posteConstante ? (
        blocConstantes
      ) : onglet === 'nouveau' ? (        <>
          <Card>
            <SectionTitle>Patient</SectionTitle>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, modePatient === 'nouveau' && styles.chipActif]}
                onPress={() => setModePatient('nouveau')}
              >
                <Text style={[styles.chipTexte, modePatient === 'nouveau' && styles.chipTexteActif]}>
                  Nouveau patient
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, modePatient === 'existant' && styles.chipActif]}
                onPress={() => setModePatient('existant')}
              >
                <Text style={[styles.chipTexte, modePatient === 'existant' && styles.chipTexteActif]}>
                  Patient existant
                </Text>
              </TouchableOpacity>
            </View>

            {modePatient === 'existant' ? (
              <>
                <Input
                  label="Rechercher (code patient ou nom)"
                  value={recherchePatient}
                  onChangeText={setRecherchePatient}
                  placeholder="Ex : UN5Z5Y ou TRAORE"
                />
                {resultatsPatients.map((pt) => (
                  <TouchableOpacity
                    key={pt.id}
                    style={styles.patientItem}
                    onPress={() => setPatientChoisi(pt)}
                  >
                    <Text style={styles.patientItemTexte}>
                      {pt.nom} {pt.prenom} · {pt.code}
                      {pt.age ? ` · ${pt.age} ans` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
                {patientChoisi ? (
                  <View style={styles.patientChoisi}>
                    <Text style={styles.patientChoisiTexte}>
                      ✅ {patientChoisi.nom} {patientChoisi.prenom} ({patientChoisi.code})
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Input label="Nom *" value={nom} onChangeText={setNom} />
                <Input label="Prénoms" value={prenom} onChangeText={setPrenom} />
                <View style={styles.ligne}>
                  <View style={styles.ligneItem}>
                    <Input label="Âge" value={age} onChangeText={setAge} keyboardType="numeric" />
                  </View>
                  <View style={styles.ligneItem}>
                    <Input label="Sexe" value={sexe} onChangeText={setSexe} placeholder="M / F" />
                  </View>
                </View>
                <Input
                  label="Téléphone"
                  value={telephone}
                  onChangeText={setTelephone}
                  keyboardType="phone-pad"
                />
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
                  options={consultationsDuService.map((p) => ({ value: p.id, label: p.libelle }))}
                  placeholder="— Choisir —"
                  onChange={(v) => setConsultationId(v as number)}
                />
              </Input>
            ) : null}
            <Input label="Type de patient">
              <ListeSelect
                value={typePatient}
                options={[
                  { value: 'INTERNE', label: 'Patient interne' },
                  { value: 'EXTERNE', label: 'Patient externe' },
                ]}
                onChange={(v) => setTypePatient(v as 'INTERNE' | 'EXTERNE')}
              />
            </Input>
            {typePatient === 'EXTERNE' ? (
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
                      options={actesDuService.map((p) => ({ value: p.id, label: p.libelle }))}
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
            <Btn title="Enregistrer le passage" onPress={enregistrerPassage} loading={saving} />
          </Card>

          {ticket ? <ApercuTexte contenu={ticket} /> : null}
        </>
      ) : onglet === 'jour' ? (
        <Card>
          <SectionTitle>Passages du jour</SectionTitle>
          <View style={styles.barreRecherche}>
            <TextInput
              style={styles.rechercheJour}
              placeholder="Rechercher…"
              value={rechercheJour}
              onChangeText={(t) => {
                setRechercheJour(t)
                chargerJour(1)
              }}
            />
          </View>
          <FlatList
            data={passages}
            keyExtractor={(p) => String(p.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.passageItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passageNumero}>{item.numeroOrdre}</Text>
                  <Text style={styles.passagePatient}>
                    {item.patient.nom} {item.patient.prenom}
                  </Text>
                  <Badge label={item.statut} tone={item.statut === 'ACTIF' ? 'success' : 'warning'} />
                </View>
                <Btn
                  title="🖨️ Ticket"
                  small
                  variant="outline"
                  onPress={() => imprimerTicket(item.id, item.numeroOrdre)}
                />
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.vide}>{chargementListe ? 'Chargement…' : 'Aucun passage ce jour.'}</Text>
            }
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
              ✍️ Constantes — {constanteCible?.patient.nom} {constanteCible?.patient.prenom}
            </Text>
            <Text style={styles.modalSousTitre}>{constanteCible?.numeroOrdre}</Text>
            <ScrollView style={styles.modalScroll}>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input label="Taille (cm)" value={formConst.taille} onChangeText={(t) => setFormConst({ ...formConst, taille: t })} />
                </View>
                <View style={styles.ligneItem}>
                  <Input label="Température (°C)" value={formConst.temperature} onChangeText={(t) => setFormConst({ ...formConst, temperature: t })} keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input label="Pouls (bpm)" value={formConst.pouls} onChangeText={(t) => setFormConst({ ...formConst, pouls: t })} keyboardType="numeric" />
                </View>
                <View style={styles.ligneItem}>
                  <Input label="Poids (kg)" value={formConst.poids} onChangeText={(t) => setFormConst({ ...formConst, poids: t })} keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.ligne}>
                <View style={styles.ligneItem}>
                  <Input label="TA gauche (ex : 12/8)" value={formConst.tensionGauche} onChangeText={(t) => setFormConst({ ...formConst, tensionGauche: t })} />
                </View>
                <View style={styles.ligneItem}>
                  <Input label="TA droite (ex : 12/8)" value={formConst.tensionDroite} onChangeText={(t) => setFormConst({ ...formConst, tensionDroite: t })} />
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Btn title="Annuler" variant="outline" onPress={() => setConstanteCible(null)} />
              <Btn title="💾 Enregistrer" onPress={enregistrerConstantes} loading={savingConst} />
            </View>
          </View>
        </View>
      </Modal>
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
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
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
