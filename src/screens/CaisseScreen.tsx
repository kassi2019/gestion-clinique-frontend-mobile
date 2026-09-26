import React, { useEffect, useState } from 'react'
import {
  Alert,
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
  Bandeau,
  Btn,
  Card,
  InfoLigne,
  Input,
  Modale,
  Onglets,
  Screen,
  SectionTitle,
} from '../components/ui'
import ListeSelect from '../components/ListeSelect'

type Couverture = { partAssurance?: number; partPatient?: number; taux?: number }

type Ligne = {
  id: number
  libelle: string
  montant: number
  statut: string
  service?: { nom?: string }
  couverture?: Couverture
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

type AssurancePatient = {
  assurance?: { libelle?: string }
  formule?: { libelle?: string }
  numeroAssure?: string
  numeroCarte?: string
  nomAssurePrincipal?: string
  typeBeneficiaire?: string
}

type FileItem = {
  id: number
  numeroOrdre: string
  patient: { nom: string; prenom: string; code?: string }
  service?: { nom?: string }
  totalAPayer?: number
  nbLignes?: number
}

type PayeItem = {
  id: number
  numeroRecu: string
  modePaiement: string
  montant: number
  createdAt: string
  numeroOrdre: string
  patient?: { nom?: string; prenom?: string; code?: string }
}

const MODES: { value: string; label: string }[] = [
  { value: 'ESPECES', label: '💵 Espèces' },
  { value: 'MOBILE_MONEY', label: '📱 Mobile Money' },
  { value: 'CARTE', label: '💳 Carte bancaire' },
]

const LABELS_BENEFICIAIRE: Record<string, string> = {
  ASSURE: 'Assuré(e)',
  CONJOINT: 'Conjoint(e)',
  ENFANT: 'Enfant',
  AUTRE: 'Autre bénéficiaire',
}

function aujourdhui(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

export default function CaisseScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1
  const estAdmin = user?.role?.code === 'ADMINISTRATEUR'

  // Liste sans passage ouvert : 3 onglets (comme le web)
  const [onglet, setOnglet] = useState<'file' | 'payes' | 'recherche'>('file')
  const [fileAttente, setFileAttente] = useState<FileItem[]>([])
  const [payes, setPayes] = useState<PayeItem[]>([])
  const [chargementListes, setChargementListes] = useState(false)

  // Recherche
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<Passage[]>([])

  // Fiche du passage ouvert
  const [passage, setPassage] = useState<Passage | null>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [assurancePatient, setAssurancePatient] = useState<AssurancePatient | null>(null)
  const [cochees, setCochees] = useState<Set<number>>(new Set())
  const [modePaiement, setModePaiement] = useState('ESPECES')
  const [tauxApplique, setTauxApplique] = useState('')
  const [motifTaux, setMotifTaux] = useState('')
  const [encaissement, setEncaissement] = useState(false)
  const [recu, setRecu] = useState<string | null>(null)

  // Modales
  const [modaleAnnulation, setModaleAnnulation] = useState<{ paiement: Paiement; motif: string } | null>(null)
  const [modalePrestation, setModalePrestation] = useState(false)
  const [services, setServices] = useState<{ value: number; label: string }[]>([])
  const [prestations, setPrestations] = useState<{ value: number; label: string }[]>([])
  const [serviceFiltre, setServiceFiltre] = useState<number | null>(null)
  const [prestationChoisie, setPrestationChoisie] = useState<number | null>(null)
  const [ajoutEnCours, setAjoutEnCours] = useState(false)

  // ─── Listes (file / payés) ───────────────────────────────────
  async function chargerListes() {
    setChargementListes(true)
    try {
      const [f, p] = await Promise.all([
        http.get('/caisse/file-attente', { params: { cliniqueId, jour: aujourdhui(), perPage: 100 } }),
        http.get('/caisse/payes', { params: { cliniqueId, perPage: 100 } }),
      ])
      setFileAttente(f.data.data ?? [])
      setPayes(p.data.data ?? [])
    } catch {
      /* listes vides si l'API ne répond pas */
    } finally {
      setChargementListes(false)
    }
  }

  useEffect(() => {
    if (!passage) chargerListes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage])

  // ─── Recherche (debounce 300 ms) ─────────────────────────────
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

  // ─── Fiche du passage ────────────────────────────────────────
  async function choisirPassage(p: Passage) {
    setPassage(p)
    setResultats([])
    setRecu(null)
    setTauxApplique('')
    setMotifTaux('')
    try {
      const { data } = await http.get(`/caisse/passages/${p.id}`)
      const lignesData: Ligne[] = data.prestations ?? data.passage?.prestations ?? []
      setLignes(lignesData)
      setPaiements(data.paiements ?? data.passage?.paiements ?? [])
      setAssurancePatient(data.assurancePatient ?? null)
      setCochees(new Set(lignesData.filter((l) => l.statut === 'EN_ATTENTE').map((l) => l.id)))
    } catch {
      Alert.alert('Caisse', 'Impossible de charger le passage.')
    }
  }

  function fermerPassage() {
    setPassage(null)
    setLignes([])
    setPaiements([])
    setAssurancePatient(null)
    setRecu(null)
    chargerListes()
  }

  function toggleLigne(id: number) {
    const n = new Set(cochees)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setCochees(n)
  }

  const lignesCochees = lignes.filter((l) => l.statut === 'EN_ATTENTE' && cochees.has(l.id))
  const sousTotal = lignesCochees.reduce((s, l) => s + Number(l.montant), 0)
  const partAssuranceTotale = lignesCochees.reduce(
    (s, l) => s + Number(l.couverture?.partAssurance ?? 0),
    0,
  )

  function statutLigneLabel(l: Ligne): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
    if (l.statut === 'PAYEE') return { label: 'Payée', tone: 'success' }
    if (l.statut === 'ANNULEE') return { label: 'Annulée', tone: 'danger' }
    if (l.statut === 'NON_PRESCRITE') return { label: 'Pas encore prescrite', tone: 'muted' }
    if (l.statut === 'EXTERNE') return { label: 'Externe (non facturable)', tone: 'muted' }
    return { label: 'En attente', tone: 'warning' }
  }

  // ─── Encaissement ────────────────────────────────────────────
  async function encaisser() {
    if (!passage || cochees.size === 0) {
      Alert.alert('Caisse', 'Aucune prestation cochée.')
      return
    }
    const taux = tauxApplique.trim()
    if (taux && !motifTaux.trim()) {
      Alert.alert('Caisse', 'Un motif est obligatoire quand un taux exceptionnel est appliqué.')
      return
    }
    const total = sousTotal - partAssuranceTotale
    Alert.alert(
      'Encaisser ?',
      `Total : ${total.toLocaleString('fr-FR')} FCFA (${modePaiement})`,
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
                ...(taux ? { tauxApplique: Number(taux) } : {}),
                ...(taux && motifTaux.trim() ? { motifTaux: motifTaux.trim() } : {}),
              })
              Alert.alert('✅ Paiement enregistré', `Reçu ${data.paiement?.numeroRecu ?? ''}`)
              // L'impression est déjà déclenchée par le backend (autoPrint).
              // L'aperçu vient de la réponse — pas de second POST (éviterait
              // une double impression avec l'agent).
              if (data.impression?.contenu) setRecu(data.impression.contenu)
              else setRecu(`Reçu ${data.paiement?.numeroRecu ?? ''} enregistré.`)
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

  // ─── Annulation (modale à motif — Android/iOS) ───────────────
  async function confirmerAnnulation() {
    if (!modaleAnnulation) return
    const { paiement, motif } = modaleAnnulation
    if (motif.trim().length < 3) {
      Alert.alert('Annulation', 'Le motif est obligatoire (3 caractères minimum).')
      return
    }
    try {
      await http.post(`/caisse/paiements/${paiement.id}/annuler`, { motif: motif.trim() })
      Alert.alert('✅ Paiement annulé')
      setModaleAnnulation(null)
      await choisirPassage(passage!)
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? 'Annulation impossible.')
    }
  }

  // ─── Ajout / retrait de prestation ───────────────────────────
  async function ouvrirAjoutPrestation() {
    setPrestationChoisie(null)
    setServiceFiltre(null)
    setModalePrestation(true)
    try {
      const [s, p] = await Promise.all([
        http.get('/services', { params: { perPage: 0 } }),
        http.get('/prestations', { params: { perPage: 0, cliniqueId } }),
      ])
      setServices(
        (s.data.data ?? []).map((x: any) => ({ value: x.id, label: x.nom })),
      )
      setPrestations(
        (p.data.data ?? [])
          .filter((x: any) => x.actif !== false)
          .map((x: any) => ({ value: x.id, label: `${x.libelle} — ${Number(x.montant ?? 0).toLocaleString('fr-FR')} F` })),
      )
    } catch {
      Alert.alert('Caisse', 'Impossible de charger les prestations.')
      setModalePrestation(false)
    }
  }

  async function ajouterPrestation() {
    if (!passage || !prestationChoisie) {
      Alert.alert('Caisse', 'Choisissez une prestation.')
      return
    }
    setAjoutEnCours(true)
    try {
      await http.post(`/caisse/passages/${passage.id}/prestations`, { prestationId: prestationChoisie })
      setModalePrestation(false)
      await choisirPassage(passage)
    } catch (e: any) {
      const msg = e.response?.data?.message
      Alert.alert('Erreur', Array.isArray(msg) ? msg.join('\n') : msg ?? 'Ajout impossible.')
    } finally {
      setAjoutEnCours(false)
    }
  }

  function retirerLigne(l: Ligne) {
    Alert.alert('Retirer la prestation ?', `« ${l.libelle} » sera supprimée du passage.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await http.delete(`/caisse/prestations/${l.id}`)
            await choisirPassage(passage!)
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Suppression impossible.')
          }
        },
      },
    ])
  }

  // ─── Réimpression ────────────────────────────────────────────
  async function reimprimer(paiementId: number) {
    try {
      const { data } = await http.post(`/impression/paiements/${paiementId}`)
      setRecu(data.contenu ?? 'Reçu envoyé à l’imprimante.')
    } catch (e: any) {
      Alert.alert('Impression', e.response?.data?.message ?? 'Impression impossible.')
    }
  }

  // ─── Rendu ───────────────────────────────────────────────────
  return (
    <Screen>
      <Bandeau titre="💰 Caisse" onRetour={() => navigation.goBack()} />

      {!passage ? (
        <>
          <Onglets
            actif={onglet}
            onChange={(k) => setOnglet(k as typeof onglet)}
            tabs={[
              { key: 'file', label: "File d'attente", count: fileAttente.length },
              { key: 'payes', label: 'Payés du jour', count: payes.length },
              { key: 'recherche', label: 'Recherche' },
            ]}
          />

          {onglet === 'file' ? (
            <Card>
              <SectionTitle>En attente de paiement (aujourd'hui)</SectionTitle>
              {chargementListes ? <Text style={styles.vide}>Chargement…</Text> : null}
              {!chargementListes && fileAttente.length === 0 ? (
                <Text style={styles.vide}>Aucun passage en attente de paiement.</Text>
              ) : null}
              {fileAttente.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={styles.item}
                  onPress={() => choisirPassage({ id: f.id, numeroOrdre: f.numeroOrdre, statut: '', patient: f.patient, service: f.service })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitre}>
                      {f.patient?.nom ?? ''} {f.patient?.prenom ?? ''}
                    </Text>
                    <Text style={styles.itemSous}>
                      {f.numeroOrdre} · {f.service?.nom ?? ''} · {f.nbLignes ?? 0} ligne(s)
                    </Text>
                  </View>
                  <Text style={styles.itemMontant}>
                    {Number(f.totalAPayer ?? 0).toLocaleString('fr-FR')} F
                  </Text>
                </TouchableOpacity>
              ))}
            </Card>
          ) : null}

          {onglet === 'payes' ? (
            <Card>
              <SectionTitle>Paiements du jour</SectionTitle>
              {chargementListes ? <Text style={styles.vide}>Chargement…</Text> : null}
              {!chargementListes && payes.length === 0 ? (
                <Text style={styles.vide}>Aucun paiement aujourd'hui.</Text>
              ) : null}
              {payes.map((p) => (
                <View key={p.id} style={styles.paiementItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paiementRecu}>{p.numeroRecu}</Text>
                    <Text style={styles.paiementInfos}>
                      {new Date(p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {p.patient?.nom ?? ''} {p.patient?.prenom ?? ''} · {p.numeroOrdre}
                    </Text>
                  </View>
                  <Text style={styles.paiementMontant}>{Number(p.montant).toLocaleString('fr-FR')} F</Text>
                  <Btn title="Reçu" small variant="outline" onPress={() => reimprimer(p.id)} />
                </View>
              ))}
            </Card>
          ) : null}

          {onglet === 'recherche' ? (
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
          ) : null}
        </>
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
              <Btn title="✕ Autre" small variant="outline" onPress={fermerPassage} />
            </View>
          </Card>

          {assurancePatient ? (
            <Card>
              <SectionTitle>🛡️ Assurance</SectionTitle>
              <InfoLigne label="Assurance" value={assurancePatient.assurance?.libelle ?? '—'} />
              <InfoLigne label="Formule" value={assurancePatient.formule?.libelle ?? '—'} />
              <InfoLigne label="N° assuré" value={assurancePatient.numeroAssure ?? '—'} />
              <InfoLigne
                label="Bénéficiaire"
                value={LABELS_BENEFICIAIRE[assurancePatient.typeBeneficiaire ?? ''] ?? assurancePatient.typeBeneficiaire ?? '—'}
              />
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Prestations à régler</SectionTitle>
            {lignes.map((l) => {
              const statut = statutLigneLabel(l)
              const payable = l.statut === 'EN_ATTENTE'
              const grise = l.statut === 'NON_PRESCRITE' || l.statut === 'EXTERNE'
              const couv = l.couverture
              return (
                <View key={l.id}>
                  <TouchableOpacity
                    style={[styles.lignePrestation, grise && styles.ligneGrisee]}
                    onPress={() => payable && toggleLigne(l.id)}
                    disabled={!payable}
                  >
                    <View style={[styles.checkbox, payable && cochees.has(l.id) && styles.checkboxCochee]}>
                      {payable && cochees.has(l.id) ? <Text style={styles.checkboxTexte}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.ligneLibelle}>{l.libelle}</Text>
                      <Text style={styles.ligneService}>{l.service?.nom ?? '—'}</Text>
                      {couv ? (
                        <Text style={styles.lignePartage}>
                          Assurance {Number(couv.partAssurance ?? 0).toLocaleString('fr-FR')} F · Patient{' '}
                          {Number(couv.partPatient ?? 0).toLocaleString('fr-FR')} F (taux {couv.taux ?? '—'} %)
                        </Text>
                      ) : null}
                      <View style={styles.ligneStatut}>
                        <Badge label={statut.label} tone={statut.tone} />
                      </View>
                    </View>
                    <Text style={styles.ligneMontant}>
                      {l.statut === 'EXTERNE' ? '—' : `${Number(l.montant).toLocaleString('fr-FR')} F`}
                    </Text>
                    {payable ? (
                      <TouchableOpacity onPress={() => retirerLigne(l)} style={styles.ligneRetirer}>
                        <Text style={styles.ligneRetirerTexte}>✕</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                </View>
              )
            })}

            <Btn title="+ Ajouter une prestation" small variant="outline" onPress={ouvrirAjoutPrestation} />

            <View style={styles.recap}>
              <Text style={styles.recapLigne}>
                Sous-total : <Text style={styles.recapValeur}>{sousTotal.toLocaleString('fr-FR')} FCFA</Text>
              </Text>
              {partAssuranceTotale > 0 ? (
                <>
                  <Text style={[styles.recapLigne, { color: colors.warning }]}>
                    Part assurance : {partAssuranceTotale.toLocaleString('fr-FR')} FCFA
                  </Text>
                  <Text style={styles.recapLigne}>
                    Part patient : {(sousTotal - partAssuranceTotale).toLocaleString('fr-FR')} FCFA
                  </Text>
                </>
              ) : null}
              <Text style={styles.recapSousTotal}>
                Total à payer :{' '}
                <Text style={styles.recapTotal}>
                  {(sousTotal - partAssuranceTotale).toLocaleString('fr-FR')} FCFA
                </Text>
              </Text>
            </View>

            {assurancePatient ? (
              <View style={styles.blocTaux}>
                <Input
                  label="Taux exceptionnel % (optionnel)"
                  value={tauxApplique}
                  onChangeText={setTauxApplique}
                  keyboardType="numeric"
                  placeholder="Ex : 100"
                />
                <Input
                  label="Motif du taux (obligatoire si taux renseigné)"
                  value={motifTaux}
                  onChangeText={setMotifTaux}
                  placeholder="Ex : accord de la direction"
                />
              </View>
            ) : null}

            <Input label="Mode de paiement">
              <ListeSelect
                value={modePaiement}
                options={MODES}
                onChange={(v) => setModePaiement(v as string)}
              />
            </Input>
            <Btn
              title="💰 Encaisser"
              onPress={encaisser}
              loading={encaissement}
              disabled={sousTotal - partAssuranceTotale === 0 && cochees.size > 0}
            />
          </Card>

          <Card>
            <SectionTitle>Historique des paiements</SectionTitle>
            {paiements.length === 0 ? (
              <Text style={styles.vide}>Aucun paiement.</Text>
            ) : (
              paiements.map((p) => (
                <View key={p.id} style={styles.paiementItem}>
                  <View style={styles.paiementEntete}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.paiementRecu} numberOfLines={1} ellipsizeMode="tail">
                        {p.numeroRecu}
                      </Text>
                      <Text style={styles.paiementInfos} numberOfLines={1} ellipsizeMode="tail">
                        {new Date(p.createdAt).toLocaleString('fr-FR')} · {p.modePaiement}
                      </Text>
                    </View>
                    <Text style={styles.paiementMontant}>
                      {Number(p.montantTotal).toLocaleString('fr-FR')} F
                    </Text>
                  </View>
                  <View style={styles.paiementActions}>
                    <Badge label={p.statut === 'VALIDE' ? 'Validé' : 'Annulé'} tone={p.statut === 'VALIDE' ? 'success' : 'danger'} />
                    {p.statut === 'VALIDE' ? (
                      <Btn title="Reçu" small variant="outline" onPress={() => reimprimer(p.id)} />
                    ) : null}
                    {p.statut === 'VALIDE' && estAdmin ? (
                      <Btn
                        title="Annuler"
                        small
                        variant="danger"
                        onPress={() => setModaleAnnulation({ paiement: p, motif: '' })}
                      />
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Card>

          {recu ? <ApercuTexte contenu={recu} /> : null}
        </>
      )}

      {/* Modale annulation de paiement (motif obligatoire) */}
      <Modale
        visible={modaleAnnulation !== null}
        titre="Annuler le paiement ?"
        sousTitre={
          modaleAnnulation
            ? `Reçu ${modaleAnnulation.paiement.numeroRecu} — ${Number(modaleAnnulation.paiement.montantTotal).toLocaleString('fr-FR')} FCFA`
            : undefined
        }
        onFermer={() => setModaleAnnulation(null)}
        actions={
          <>
            <Btn title="Fermer" small variant="outline" onPress={() => setModaleAnnulation(null)} />
            <Btn title="Annuler le paiement" small variant="danger" onPress={confirmerAnnulation} />
          </>
        }
      >
        <Input
          label="Motif (obligatoire)"
          value={modaleAnnulation?.motif ?? ''}
          onChangeText={(t) => modaleAnnulation && setModaleAnnulation({ ...modaleAnnulation, motif: t })}
          placeholder="Ex : erreur de saisie"
        />
      </Modale>

      {/* Modale ajout de prestation */}
      <Modale
        visible={modalePrestation}
        titre="Ajouter une prestation"
        onFermer={() => setModalePrestation(false)}
        actions={
          <>
            <Btn title="Fermer" small variant="outline" onPress={() => setModalePrestation(false)} />
            <Btn title="Ajouter" small onPress={ajouterPrestation} loading={ajoutEnCours} />
          </>
        }
      >
        <Input label="Service (optionnel)">
          <ListeSelect
            value={serviceFiltre}
            options={services}
            placeholder="Tous les services"
            onChange={(v) => setServiceFiltre(v as number | null)}
          />
        </Input>
        <Input label="Prestation *" required>
          <ListeSelect
            value={prestationChoisie}
            options={prestations}
            onChange={(v) => setPrestationChoisie(v as number)}
          />
        </Input>
      </Modale>
    </Screen>
  )
}

const styles = StyleSheet.create({
  item: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemTitre: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  itemMontant: { fontSize: 14, fontWeight: '800', color: colors.primaryDarker },
  ficheTitre: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ficheNom: { fontSize: 16, fontWeight: '800', color: colors.primaryDarker },
  ficheSous: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  lignePrestation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  ligneStatut: { marginTop: 5, alignSelf: 'flex-start' },
  ligneLibelle: { fontSize: 14, fontWeight: '700', color: colors.text },
  ligneService: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  lignePartage: { fontSize: 12, fontWeight: '700', color: colors.primaryDark, marginTop: 2 },
  ligneMontant: { fontSize: 13.5, fontWeight: '700', color: colors.primaryDarker },
  ligneRetirer: { padding: 6 },
  ligneRetirerTexte: { color: colors.danger, fontWeight: '800', fontSize: 14 },
  recap: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  recapLigne: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  recapValeur: { fontWeight: '800', color: colors.text },
  recapSousTotal: { fontSize: 14, color: colors.textMuted },
  recapTotal: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker },
  blocTaux: {
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: colors.warningBg,
  },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
  paiementEntete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  paiementActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  paiementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
    flexWrap: 'wrap',
  },
  paiementRecu: { fontWeight: '800', color: colors.text, fontSize: 13.5 },
  paiementInfos: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  paiementMontant: { fontWeight: '800', color: colors.primaryDarker, fontSize: 14 },
})
