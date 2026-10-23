import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import http from '../api/http'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'
import { Badge, Bandeau, Btn, Card, Chips, EtatVide, Input, Modale, Onglets, Screen, SectionTitle } from '../components/ui'
import ListeSelect from '../components/ListeSelect'
import DateField from '../components/DateField'
import { h, imprimerA4 } from '../impressionA4'

type Ligne = {
  id: number
  debut: string
  derniereActivite: string | null
  heures: number
  minutesPresence: number
  present: boolean
  agent: { nom: string; prenom: string; fonction: string; role: string }
}

type Ton = 'success' | 'warning' | 'danger' | 'muted'
const STATUTS_SERVICE: Record<string, { libelle: string; ton: Ton }> = {
  EN_COURS: { libelle: 'En cours', ton: 'warning' },
  TERMINE: { libelle: 'Terminé', ton: 'muted' },
  A_VERIFIER: { libelle: 'À vérifier', ton: 'danger' },
  VALIDE: { libelle: 'Validé', ton: 'success' },
  REJETE: { libelle: 'Rejeté', ton: 'muted' },
}
const STATUTS_FICHE: Record<string, { libelle: string; ton: Ton }> = {
  BROUILLON: { libelle: 'Brouillon', ton: 'warning' },
  VALIDEE: { libelle: 'Validée', ton: 'success' },
  PAYEE: { libelle: 'Payée', ton: 'muted' },
}
const DUREES_VACATION = ['24 h', '12 h', '8 h', '6 h']

// ── Formats (identiques au web) ──
function duree(heures: number) {
  const min = Math.max(0, Math.round((heures ?? 0) * 60))
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
const nombre = (x: unknown) => Number(x ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const montant = (x: unknown) => `${Math.round(Number(x ?? 0)).toLocaleString('fr-FR')} F`
const dateHeure = (d: string | Date) =>
  new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const z = (n: number) => String(n).padStart(2, '0')
const moisCourant = () => {
  const d = new Date()
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}`
}
function decalerMois(m: string, delta: number) {
  const [a, mm] = m.split('-').map(Number)
  const d = new Date(a, mm - 1 + delta, 1)
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}`
}
function libelleMois(m: string) {
  const [a, mm] = (m ?? '').split('-').map(Number)
  return a ? new Date(a, mm - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase() : ''
}
/** Date → { date AAAA-MM-JJ, heure HH:MM } (heure locale) pour la fenêtre de correction. */
function versChamps(d: string | null) {
  if (!d) return { date: '', heure: '' }
  const x = new Date(d)
  return { date: `${x.getFullYear()}-${z(x.getMonth() + 1)}-${z(x.getDate())}`, heure: `${z(x.getHours())}:${z(x.getMinutes())}` }
}
function depuisChamps(date: string, heure: string) {
  if (!date) return undefined
  const [hh, mn] = (heure || '00:00').split(':').map(Number)
  const [a, m, j] = date.split('-').map(Number)
  return new Date(a, m - 1, j, hh || 0, mn || 0).toISOString()
}
function confirmer(titre: string, texte: string, boutonOui: string, action: () => void, danger = false) {
  Alert.alert(titre, texte, [
    { text: 'Annuler', style: 'cancel' },
    { text: boutonOui, style: danger ? 'destructive' : 'default', onPress: action },
  ])
}
const msgErreur = (e: any, defaut: string) => {
  const m = e?.response?.data?.message
  return Array.isArray(m) ? m.join('\n') : m ?? defaut
}

/**
 * Module Finances (mobile) — comme le web : qui est en service maintenant,
 * contrôle des services du mois, tarifs des agents et fiches de vacation.
 */
export default function FinancesScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id
  const cliniqueNom = user?.clinique?.nom ?? 'Gestion Clinique'
  const [onglet, setOnglet] = useState<'direct' | 'services' | 'tarifs' | 'fiches'>('direct')
  const [mois, setMois] = useState(moisCourant())
  const ongletRef = useRef(onglet)
  ongletRef.current = onglet

  // ═══════════ En service maintenant ═══════════
  const [direct, setDirect] = useState<{ lignes: Ligne[]; total: number; presents: number; maintenant?: string }>({
    lignes: [],
    total: 0,
    presents: 0,
  })
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(false)

  async function chargerDirect() {
    setChargement(true)
    try {
      const { data } = await http.get('/finances/en-service', { params: { cliniqueId } })
      setDirect(data)
      setErreur('')
    } catch (e: any) {
      setErreur(msgErreur(e, 'Liste du personnel en service indisponible.'))
    } finally {
      setChargement(false)
    }
  }

  const depuis = (d: string | null, debut: string) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(d ?? debut).getTime()) / 60000))
    return min < 60 ? `${min} min` : duree(min / 60)
  }

  // ═══════════ Services du mois ═══════════
  const [services, setServices] = useState<any[]>([])
  const [filtreAgent, setFiltreAgent] = useState<number | null>(null)
  const [correction, setCorrection] = useState<{
    id: number
    agent: string
    debutDate: string
    debutHeure: string
    finDate: string
    finHeure: string
    heuresRetenues: string
    vacationsRetenues: string
    motif: string
  } | null>(null)

  async function chargerServices(m = mois, agent = filtreAgent) {
    try {
      const { data } = await http.get('/finances/services', {
        params: { cliniqueId, mois: m, personnelId: agent ?? undefined },
      })
      setServices(data ?? [])
    } catch (e: any) {
      setServices([])
      Alert.alert('Finances', msgErreur(e, 'Services indisponibles.'))
    }
  }

  async function changerStatutService(s: any, statut: 'VALIDE' | 'REJETE') {
    try {
      await http.patch(`/finances/services/${s.id}`, { statut })
      Alert.alert(statut === 'VALIDE' ? '✅ Service validé' : 'Service rejeté')
      await chargerServices()
    } catch (e: any) {
      Alert.alert('Erreur', msgErreur(e, 'Modification impossible.'))
    }
  }

  function statutService(s: any, statut: 'VALIDE' | 'REJETE') {
    if (statut === 'REJETE') {
      confirmer(
        'Rejeter ce service ?',
        `Service de ${s.agent.nom} ${s.agent.prenom} du ${dateHeure(s.debut)} : il ne sera pas payé.`,
        'Oui, rejeter',
        () => changerStatutService(s, statut),
        true,
      )
    } else {
      changerStatutService(s, statut)
    }
  }

  function ouvrirCorrection(s: any) {
    const debut = versChamps(s.debut)
    const fin = versChamps(s.fin)
    setCorrection({
      id: s.id,
      agent: `${s.agent.nom} ${s.agent.prenom}`,
      debutDate: debut.date,
      debutHeure: debut.heure,
      finDate: fin.date,
      finHeure: fin.heure,
      heuresRetenues: s.corrige ? String(s.heures) : '',
      vacationsRetenues: s.corrige ? String(s.vacations) : '',
      motif: s.motifCorrection ?? '',
    })
  }

  async function enregistrerCorrection() {
    const c = correction
    if (!c) return
    if (!c.motif.trim()) {
      Alert.alert('Correction', 'Indiquez le motif de la correction.')
      return
    }
    const nb = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')))
    try {
      await http.patch(`/finances/services/${c.id}`, {
        debut: depuisChamps(c.debutDate, c.debutHeure),
        fin: depuisChamps(c.finDate, c.finHeure),
        heuresRetenues: nb(c.heuresRetenues),
        vacationsRetenues: nb(c.vacationsRetenues),
        motif: c.motif.trim(),
      })
      Alert.alert('✅ Service corrigé')
      setCorrection(null)
      await chargerServices()
    } catch (e: any) {
      Alert.alert('Erreur', msgErreur(e, 'Correction impossible.'))
    }
  }

  // ═══════════ Tarifs des agents ═══════════
  const [agents, setAgents] = useState<any[]>([])
  const [rechercheAgent, setRechercheAgent] = useState('')

  async function chargerAgents() {
    try {
      const { data } = await http.get('/finances/remunerations', { params: { cliniqueId } })
      setAgents(
        (data ?? []).map((a: any) => ({
          ...a,
          form: {
            statut: a.remuneration?.statut ?? 'VACATAIRE',
            mode: a.remuneration?.mode ?? 'VACATION',
            tarif: String(a.remuneration?.tarif ?? 0),
            dureeVacationHeures: a.remuneration?.dureeVacationHeures ?? 24,
            actif: a.remuneration?.actif ?? true,
          },
        })),
      )
    } catch (e: any) {
      Alert.alert('Finances', msgErreur(e, 'Liste des agents indisponible.'))
    }
  }

  const agentsFiltres = useMemo(() => {
    const q = rechercheAgent.trim().toLowerCase()
    return q ? agents.filter((a) => `${a.nom} ${a.prenom} ${a.fonction} ${a.matricule}`.toLowerCase().includes(q)) : agents
  }, [agents, rechercheAgent])

  function modifierForm(personnelId: number, champs: Record<string, unknown>) {
    setAgents((liste) => liste.map((a) => (a.personnelId === personnelId ? { ...a, form: { ...a.form, ...champs } } : a)))
  }

  async function enregistrerTarif(a: any) {
    try {
      const { data } = await http.put(`/finances/remunerations/${a.personnelId}`, {
        ...a.form,
        tarif: Number(a.form.tarif) || 0,
      })
      setAgents((liste) => liste.map((x) => (x.personnelId === a.personnelId ? { ...x, remuneration: data } : x)))
      Alert.alert('✅ Tarif enregistré', `${a.nom} ${a.prenom}`)
    } catch (e: any) {
      Alert.alert('Erreur', msgErreur(e, 'Enregistrement impossible.'))
    }
  }

  // ═══════════ Fiches de vacation ═══════════
  const [fiches, setFiches] = useState<{ lignes: any[]; total: number }>({ lignes: [], total: 0 })
  const [calculEnCours, setCalculEnCours] = useState(false)

  async function chargerFiches(m = mois) {
    try {
      const { data } = await http.get('/finances/fiches', { params: { cliniqueId, mois: m } })
      setFiches({
        ...data,
        lignes: (data?.lignes ?? []).map((f: any) => ({ ...f, primesSaisie: String(f.primes ?? 0), retenuesSaisie: String(f.retenues ?? 0) })),
      })
    } catch (e: any) {
      setFiches({ lignes: [], total: 0 })
      Alert.alert('Finances', msgErreur(e, 'Fiches indisponibles.'))
    }
  }

  async function genererFiches() {
    setCalculEnCours(true)
    try {
      const { data } = await http.post('/finances/fiches/generer', { cliniqueId, mois })
      Alert.alert(
        '✅ Fiches calculées',
        `${data.creees} fiche(s) créée(s), ${data.misesAJour} recalculée(s)${data.figees ? `, ${data.figees} déjà validée(s) non modifiée(s)` : ''}.`,
      )
      await chargerFiches()
    } catch (e: any) {
      Alert.alert('Erreur', msgErreur(e, 'Calcul impossible.'))
    } finally {
      setCalculEnCours(false)
    }
  }

  function saisieFiche(id: number, champs: Record<string, string>) {
    setFiches((f) => ({ ...f, lignes: f.lignes.map((x) => (x.id === id ? { ...x, ...champs } : x)) }))
  }
  const primesDe = (f: any) => Number(f.primesSaisie) || 0
  const retenuesDe = (f: any) => Number(f.retenuesSaisie) || 0

  async function enregistrerFiche(f: any) {
    try {
      await http.patch(`/finances/fiches/${f.id}`, { primes: primesDe(f), retenues: retenuesDe(f) })
      Alert.alert('✅ Fiche enregistrée')
      await chargerFiches()
    } catch (e: any) {
      Alert.alert('Erreur', msgErreur(e, 'Enregistrement impossible.'))
    }
  }

  function statutFiche(f: any, statut: 'VALIDEE' | 'PAYEE' | 'BROUILLON') {
    const agent = `${f.personnel.nom} ${f.personnel.prenom}`
    const questions = {
      VALIDEE: ['Valider la fiche ?', `Fiche de ${agent} : elle ne sera plus recalculée et les services du mois seront verrouillés.`, 'Oui, valider'],
      PAYEE: ['Confirmer le paiement ?', `${montant(f.montantTotal)} versés à ${agent}. Une fiche payée est définitive.`, 'Oui, payée'],
      BROUILLON: ['Repasser en brouillon ?', `La fiche de ${agent} redevient modifiable.`, 'Oui, modifier'],
    }[statut]
    confirmer(questions[0], questions[1], questions[2], async () => {
      try {
        if (statut === 'VALIDEE') await http.patch(`/finances/fiches/${f.id}`, { primes: primesDe(f), retenues: retenuesDe(f) })
        await http.post(`/finances/fiches/${f.id}/statut`, { statut })
        Alert.alert('✅ Fiche mise à jour')
        await chargerFiches()
      } catch (e: any) {
        Alert.alert('Erreur', msgErreur(e, 'Changement impossible.'))
      }
    })
  }

  // ── Impressions A4 (mêmes feuilles que le web) ──
  async function imprimerFiche(f: any) {
    try {
      const { data } = await http.get(`/finances/fiches/${f.id}`)
      const parHeure = f.mode === 'HEURE'
      imprimerA4(`
        <h1>${h(cliniqueNom)}</h1>
        <h2>FICHE DE VACATION — ${libelleMois(f.mois)}</h2>
        <table class="infos">
          <tr><td>Agent</td><td><b>${h(f.personnel.nom)} ${h(f.personnel.prenom)}</b></td></tr>
          <tr><td>Matricule / fonction</td><td>${h(f.personnel.matricule)} — ${h(f.personnel.fonction)}</td></tr>
          <tr><td>Tarif appliqué</td><td>${montant(f.tarif)} par ${parHeure ? 'heure' : `vacation de ${f.dureeVacationHeures} h`}</td></tr>
          ${parHeure ? '' : `<tr><td>Calcul</td><td>vacations d'un service = heures du service ÷ ${f.dureeVacationHeures} h</td></tr>`}
        </table>
        <h3>Services effectués</h3>
        <table>
          <thead><tr><th>N°</th><th>Début</th><th>Fin</th><th class="num">Heures</th><th class="num">Vacations</th><th>Observation</th></tr></thead>
          <tbody>
            ${(data.services ?? [])
              .map(
                (s: any, i: number) => `<tr>
                  <td>${i + 1}</td><td>${dateHeure(s.debut)}</td><td>${s.fin ? dateHeure(s.fin) : '—'}</td>
                  <td class="num">${nombre(s.heures)}</td><td class="num">${nombre(s.vacations)}</td>
                  <td>${h(s.motifCorrection || (s.statut === 'A_VERIFIER' ? 'À vérifier' : ''))}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        <table class="infos">
          <tr><td>Total des heures</td><td class="num">${nombre(f.heures)}</td></tr>
          <tr><td>Total des vacations</td><td class="num">${nombre(f.vacations)}</td></tr>
          <tr><td>Montant des ${parHeure ? 'heures' : 'vacations'} (${nombre(parHeure ? f.heures : f.vacations)} × ${montant(f.tarif)})</td><td class="num">${montant(f.montantBase)}</td></tr>
          <tr><td>Primes</td><td class="num">+ ${montant(f.primes)}</td></tr>
          <tr><td>Retenues</td><td class="num">− ${montant(f.retenues)}</td></tr>
          <tr class="total"><td>MONTANT DÛ</td><td class="num">${montant(f.montantTotal)}</td></tr>
        </table>
        ${f.commentaire ? `<p>Observation : ${h(f.commentaire)}</p>` : ''}
        <div class="sign">
          <div>L'agent<br /><small>Nom, signature et date</small></div>
          <div>Le responsable<br /><small>Signature et cachet</small></div>
        </div>
      `)
    } catch (e: any) {
      Alert.alert('Impression', msgErreur(e, 'Impression impossible.'))
    }
  }

  function imprimerEtat() {
    imprimerA4(`
      <h1>${h(cliniqueNom)}</h1>
      <h2>ÉTAT DES VACATIONS — ${libelleMois(mois)}</h2>
      <table>
        <thead><tr>
          <th>Agent</th><th class="num">Services</th><th class="num">Heures</th><th class="num">Vacations</th><th class="num">Tarif</th>
          <th class="num">Primes</th><th class="num">Retenues</th><th class="num">Total dû</th><th>État</th>
        </tr></thead>
        <tbody>
          ${fiches.lignes
            .map(
              (f) => `<tr>
                <td>${h(f.personnel.nom)} ${h(f.personnel.prenom)}</td><td class="num">${f.nbServices}</td>
                <td class="num">${nombre(f.heures)}</td><td class="num">${nombre(f.vacations)}</td><td class="num">${montant(f.tarif)}</td>
                <td class="num">${montant(f.primes)}</td><td class="num">${montant(f.retenues)}</td>
                <td class="num"><b>${montant(f.montantTotal)}</b></td><td>${STATUTS_FICHE[f.statut]?.libelle ?? f.statut}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
        <tfoot><tr class="total"><td colspan="7">TOTAL</td><td class="num">${montant(fiches.total)}</td><td></td></tr></tfoot>
      </table>
      <div class="sign">
        <div>Imprimé le ${dateHeure(new Date())}</div>
        <div>Le responsable<br /><small>Signature et cachet</small></div>
      </div>
    `)
  }

  // ── Chargements ──
  useEffect(() => {
    chargerDirect()
    chargerAgents()
    // Mise à jour automatique toutes les 30 secondes (onglet « En service »)
    const minuterie = setInterval(() => {
      if (ongletRef.current === 'direct') chargerDirect()
    }, 30000)
    return () => clearInterval(minuterie)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changerOnglet(o: string) {
    const cle = o as typeof onglet
    setOnglet(cle)
    if (cle === 'direct') chargerDirect()
    if (cle === 'services') chargerServices()
    if (cle === 'tarifs') chargerAgents()
    if (cle === 'fiches') chargerFiches()
  }

  function changerMois(delta: number) {
    const m = decalerMois(mois, delta)
    setMois(m)
    if (onglet === 'services') chargerServices(m)
    if (onglet === 'fiches') chargerFiches(m)
  }

  const selecteurMois = (
    <View style={styles.mois}>
      <Btn title="‹" small variant="outline" onPress={() => changerMois(-1)} />
      <Text style={styles.moisTexte}>{libelleMois(mois)}</Text>
      <Btn title="›" small variant="outline" onPress={() => changerMois(1)} />
    </View>
  )

  return (
    <Screen padded={false}>
      <Bandeau titre="💼 Finances" onRetour={() => navigation.goBack()} />
      <View style={styles.contenu}>
        <Onglets
          tabs={[
            { key: 'direct', label: '🟢 En service', count: direct.total },
            { key: 'services', label: '📋 Services' },
            { key: 'tarifs', label: '💰 Tarifs' },
            { key: 'fiches', label: '🧾 Fiches' },
          ]}
          actif={onglet}
          onChange={changerOnglet}
        />

        {/* ═══════════ EN SERVICE MAINTENANT ═══════════ */}
        {onglet === 'direct' ? (
          <>
            <Card>
              <SectionTitle>🟢 Qui est en service maintenant ?</SectionTitle>
              <Text style={styles.note}>
                Mise à jour automatique toutes les 30 secondes
                {direct.maintenant ? ` — dernière à ${new Date(direct.maintenant).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
              <View style={styles.kpis}>
                <View style={styles.kpi}>
                  <Text style={styles.kpiValeur}>{direct.total}</Text>
                  <Text style={styles.kpiLibelle}>en service</Text>
                </View>
                <View style={[styles.kpi, styles.kpiVert]}>
                  <Text style={styles.kpiValeur}>{direct.presents}</Text>
                  <Text style={styles.kpiLibelle}>actif(s)</Text>
                </View>
                <View style={[styles.kpi, styles.kpiOrange]}>
                  <Text style={styles.kpiValeur}>{direct.total - direct.presents}</Text>
                  <Text style={styles.kpiLibelle}>poste(s) inactif(s)</Text>
                </View>
              </View>
              <Btn title="🔄 Actualiser" small variant="outline" onPress={chargerDirect} loading={chargement} />
            </Card>

            {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
            {!erreur && direct.lignes.length === 0 ? <EtatVide texte="Personne n'a pris son service pour le moment." /> : null}

            {direct.lignes.map((l) => (
              <Card key={l.id} style={[styles.carte, !l.present && styles.carteInactive]}>
                <View style={styles.tete}>
                  <View style={[styles.pastille, { backgroundColor: l.present ? '#16a34a' : '#f97316' }]} />
                  <Text style={styles.nom}>
                    {l.agent.nom} {l.agent.prenom}
                  </Text>
                </View>
                <Text style={styles.fonction}>{l.agent.fonction || l.agent.role}</Text>
                <Text style={styles.ligne}>
                  Depuis le{' '}
                  <Text style={styles.gras}>
                    {new Date(l.debut).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Text>{' '}
                  — <Text style={styles.gras}>{duree(l.heures)}</Text>
                </Text>
                <Text style={styles.ligne}>Présence mesurée : {duree(l.minutesPresence / 60)}</Text>
                <View style={{ marginTop: 6 }}>
                  {l.present ? (
                    <Badge label="Actif sur son poste" tone="success" />
                  ) : (
                    <Badge label={`Poste inactif depuis ${depuis(l.derniereActivite, l.debut)}`} tone="warning" />
                  )}
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {/* ═══════════ SERVICES DU MOIS ═══════════ */}
        {onglet === 'services' ? (
          <>
            <Card>
              <SectionTitle>📋 Services pointés</SectionTitle>
              {selecteurMois}
              <Input label="Agent">
                <ListeSelect
                  value={filtreAgent}
                  options={[{ value: 0, label: 'Tous les agents' }, ...agents.map((a) => ({ value: a.personnelId, label: `${a.nom} ${a.prenom}` }))]}
                  placeholder="Tous les agents"
                  onChange={(v) => {
                    const agent = v ? (v as number) : null
                    setFiltreAgent(agent)
                    chargerServices(mois, agent)
                  }}
                />
              </Input>
              <Btn title="🔄 Actualiser" small variant="outline" onPress={() => chargerServices()} />
              <Text style={[styles.note, { marginTop: 8 }]}>
                Vérifiez les services avant de calculer les fiches : corrigez une durée erronée (avec un motif), validez ou rejetez. Les
                services fermés automatiquement (agent qui a oublié de terminer) sont marqués « À vérifier ».
              </Text>
            </Card>

            {services.length === 0 ? <EtatVide texte="Aucun service pointé sur ce mois." /> : null}
            {services.map((s) => (
              <Card key={s.id}>
                <View style={styles.teteEntre}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nom}>
                      {s.agent.nom} {s.agent.prenom}
                    </Text>
                    <Text style={styles.fonctionSimple}>{s.agent.fonction}</Text>
                  </View>
                  <Badge label={STATUTS_SERVICE[s.statut]?.libelle ?? s.statut} tone={STATUTS_SERVICE[s.statut]?.ton ?? 'muted'} />
                </View>
                <Text style={styles.ligne}>
                  Du <Text style={styles.gras}>{dateHeure(s.debut)}</Text> au{' '}
                  <Text style={styles.gras}>{s.fin ? dateHeure(s.fin) : '—'}</Text>
                </Text>
                <Text style={styles.ligne}>
                  Durée : <Text style={styles.gras}>{duree(s.heures)}</Text>
                  {s.corrige ? ` (corrigé, brut ${duree(s.heuresBrutes)})` : ''} · Vacations :{' '}
                  <Text style={styles.gras}>{nombre(s.vacations)}</Text>
                </Text>
                <Text style={[styles.ligne, s.fin && s.minutesPresence / 60 < s.heures * 0.2 && styles.alerte]}>
                  Présence sur le poste : {duree(s.minutesPresence / 60)}
                </Text>
                {s.motifCorrection ? <Text style={styles.note}>Motif : {s.motifCorrection}</Text> : null}
                {s.statut !== 'EN_COURS' ? (
                  <View style={styles.actions}>
                    <Btn title="✏️ Corriger" small variant="outline" onPress={() => ouvrirCorrection(s)} />
                    {s.statut !== 'VALIDE' ? <Btn title="✅ Valider" small onPress={() => statutService(s, 'VALIDE')} /> : null}
                    {s.statut !== 'REJETE' ? <Btn title="✕ Rejeter" small variant="danger" onPress={() => statutService(s, 'REJETE')} /> : null}
                  </View>
                ) : (
                  <Text style={styles.note}>en cours</Text>
                )}
              </Card>
            ))}
          </>
        ) : null}

        {/* ═══════════ TARIFS DES AGENTS ═══════════ */}
        {onglet === 'tarifs' ? (
          <>
            <Card>
              <SectionTitle>💰 Tarifs des agents</SectionTitle>
              <Text style={styles.note}>
                Renseignez le mode de rémunération et le tarif de chaque agent concerné, puis enregistrez. Le tarif est figé dans la
                fiche du mois au moment de sa validation.
              </Text>
              <Input label="Rechercher un agent" value={rechercheAgent} onChangeText={setRechercheAgent} placeholder="Nom, fonction, matricule…" />
            </Card>

            {agentsFiltres.length === 0 ? <EtatVide texte="Aucun agent." /> : null}
            {agentsFiltres.map((a) => (
              <Card key={a.personnelId}>
                <View style={styles.teteEntre}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nom}>
                      {a.nom} {a.prenom}
                    </Text>
                    <Text style={styles.fonctionSimple}>
                      {a.fonction} · {a.matricule}
                      {!a.aUnCompte ? ' · sans compte de connexion' : ''}
                    </Text>
                  </View>
                  {a.remuneration ? <Badge label="paramétré" tone="success" /> : null}
                </View>
                <Text style={styles.label}>Statut</Text>
                <Chips
                  options={['Vacataire', 'Salarié']}
                  value={a.form.statut === 'SALARIE' ? 'Salarié' : 'Vacataire'}
                  onChange={(v) => modifierForm(a.personnelId, { statut: v === 'Salarié' ? 'SALARIE' : 'VACATAIRE' })}
                />
                <Text style={styles.label}>Rémunération</Text>
                <Chips
                  options={['À la vacation', "À l'heure"]}
                  value={a.form.mode === 'HEURE' ? "À l'heure" : 'À la vacation'}
                  onChange={(v) => modifierForm(a.personnelId, { mode: v === "À l'heure" ? 'HEURE' : 'VACATION' })}
                />
                <Input
                  label={`Tarif (FCFA par ${a.form.mode === 'HEURE' ? 'heure' : 'vacation'})`}
                  value={a.form.tarif}
                  onChangeText={(t) => modifierForm(a.personnelId, { tarif: t })}
                  keyboardType="numeric"
                />
                {a.form.mode !== 'HEURE' ? (
                  <>
                    <Text style={styles.label}>Durée d'une vacation</Text>
                    <Chips
                      options={DUREES_VACATION}
                      value={`${a.form.dureeVacationHeures} h`}
                      onChange={(v) => modifierForm(a.personnelId, { dureeVacationHeures: parseInt(v, 10) })}
                    />
                  </>
                ) : null}
                <Text style={styles.label}>Actif</Text>
                <Chips
                  options={['Oui', 'Non']}
                  value={a.form.actif ? 'Oui' : 'Non'}
                  onChange={(v) => modifierForm(a.personnelId, { actif: v === 'Oui' })}
                />
                <Btn title="💾 Enregistrer" small onPress={() => enregistrerTarif(a)} />
              </Card>
            ))}
          </>
        ) : null}

        {/* ═══════════ FICHES DE VACATION ═══════════ */}
        {onglet === 'fiches' ? (
          <>
            <Card>
              <SectionTitle>🧾 Fiches de vacation du mois</SectionTitle>
              {selecteurMois}
              <Btn
                title={calculEnCours ? 'Calcul…' : '🔄 Calculer / recalculer les fiches du mois'}
                onPress={genererFiches}
                loading={calculEnCours}
              />
              <View style={{ marginTop: 8 }}>
                <Btn title="🖨️ État du mois (A4)" small variant="outline" onPress={imprimerEtat} disabled={!fiches.lignes.length} />
              </View>
              <Text style={[styles.note, { marginTop: 8 }]}>
                Le calcul reprend les services du mois (sauf les services rejetés) et le tarif de chaque agent. Une fiche validée ou payée
                n'est plus recalculée. Montant = vacations × tarif (ou heures × tarif horaire) ; total dû = montant + primes − retenues.
              </Text>
            </Card>

            {fiches.lignes.length === 0 ? (
              <EtatVide texte="Aucune fiche pour ce mois. Paramétrez les tarifs, puis calculez les fiches du mois." />
            ) : (
              <Card style={styles.totalMois}>
                <Text style={styles.totalTexte}>TOTAL DU MOIS : {montant(fiches.total)}</Text>
              </Card>
            )}
            {fiches.lignes.map((f) => {
              const brouillon = f.statut === 'BROUILLON'
              const totalDu = brouillon ? Number(f.montantBase) + primesDe(f) - retenuesDe(f) : f.montantTotal
              return (
                <Card key={f.id}>
                  <View style={styles.teteEntre}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nom}>
                        {f.personnel.nom} {f.personnel.prenom}
                      </Text>
                      <Text style={styles.fonctionSimple}>{f.personnel.fonction}</Text>
                    </View>
                    <Badge label={STATUTS_FICHE[f.statut]?.libelle ?? f.statut} tone={STATUTS_FICHE[f.statut]?.ton ?? 'muted'} />
                  </View>
                  {f.validePar ? <Text style={styles.note}>par {f.validePar}</Text> : null}
                  <Text style={styles.ligne}>
                    {f.nbServices} service(s) · {nombre(f.heures)} h · {nombre(f.vacations)} vacation(s)
                  </Text>
                  {f.nbAVerifier ? <Text style={[styles.ligne, styles.alerte]}>⚠️ {f.nbAVerifier} à vérifier</Text> : null}
                  <Text style={styles.ligne}>
                    Tarif : {montant(f.tarif)} / {f.mode === 'HEURE' ? 'heure' : 'vacation'} · Montant :{' '}
                    <Text style={styles.gras}>{montant(f.montantBase)}</Text>
                  </Text>
                  {brouillon ? (
                    <View style={styles.saisies}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Primes</Text>
                        <TextInput
                          style={styles.champ}
                          keyboardType="numeric"
                          value={f.primesSaisie}
                          onChangeText={(t) => saisieFiche(f.id, { primesSaisie: t })}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Retenues</Text>
                        <TextInput
                          style={styles.champ}
                          keyboardType="numeric"
                          value={f.retenuesSaisie}
                          onChangeText={(t) => saisieFiche(f.id, { retenuesSaisie: t })}
                        />
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.ligne}>
                      Primes : {montant(f.primes)} · Retenues : {montant(f.retenues)}
                    </Text>
                  )}
                  <Text style={styles.totalDu}>Total dû : {montant(totalDu)}</Text>
                  <View style={styles.actions}>
                    {brouillon ? (
                      <>
                        <Btn title="💾" small variant="outline" onPress={() => enregistrerFiche(f)} />
                        <Btn title="✅ Valider" small onPress={() => statutFiche(f, 'VALIDEE')} />
                      </>
                    ) : f.statut === 'VALIDEE' ? (
                      <>
                        <Btn title="💵 Payée" small onPress={() => statutFiche(f, 'PAYEE')} />
                        <Btn title="↩️ Brouillon" small variant="outline" onPress={() => statutFiche(f, 'BROUILLON')} />
                      </>
                    ) : null}
                    <Btn title="🖨️ Imprimer" small variant="outline" onPress={() => imprimerFiche(f)} />
                  </View>
                </Card>
              )
            })}
          </>
        ) : null}
      </View>

      {/* Fenêtre : correction d'un service */}
      <Modale
        visible={correction !== null}
        titre="✏️ Corriger le service"
        sousTitre={correction?.agent}
        onFermer={() => setCorrection(null)}
        actions={
          <>
            <Btn title="Annuler" variant="outline" onPress={() => setCorrection(null)} />
            <Btn title="💾 Enregistrer" onPress={enregistrerCorrection} />
          </>
        }
      >
        {correction ? (
          <>
            <View style={styles.saisies}>
              <View style={{ flex: 2 }}>
                <DateField label="Début" value={correction.debutDate} onChange={(v) => setCorrection({ ...correction, debutDate: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Heure"
                  value={correction.debutHeure}
                  onChangeText={(t) => setCorrection({ ...correction, debutHeure: t })}
                  placeholder="HH:MM"
                />
              </View>
            </View>
            <View style={styles.saisies}>
              <View style={{ flex: 2 }}>
                <DateField label="Fin" value={correction.finDate} onChange={(v) => setCorrection({ ...correction, finDate: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Heure"
                  value={correction.finHeure}
                  onChangeText={(t) => setCorrection({ ...correction, finHeure: t })}
                  placeholder="HH:MM"
                />
              </View>
            </View>
            <Input
              label="Heures retenues (vide = calcul automatique)"
              value={correction.heuresRetenues}
              onChangeText={(t) => setCorrection({ ...correction, heuresRetenues: t })}
              keyboardType="numeric"
            />
            <Input
              label="Vacations retenues (vide = calcul automatique)"
              value={correction.vacationsRetenues}
              onChangeText={(t) => setCorrection({ ...correction, vacationsRetenues: t })}
              keyboardType="numeric"
            />
            <Input
              label="Motif de la correction *"
              value={correction.motif}
              onChangeText={(t) => setCorrection({ ...correction, motif: t })}
              placeholder="Ex : oubli de terminer le service"
            />
          </>
        ) : null}
      </Modale>
    </Screen>
  )
}

const styles = StyleSheet.create({
  contenu: { padding: 16, paddingBottom: 40, gap: 12 },
  note: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  kpis: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  kpi: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  kpiVert: { backgroundColor: '#dcfce7' },
  kpiOrange: { backgroundColor: '#ffedd5' },
  kpiValeur: { fontSize: 20, fontWeight: '800', color: colors.text },
  kpiLibelle: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  erreur: { color: '#b91c1c', textAlign: 'center' },
  carte: { borderColor: '#86efac', borderWidth: 1.5 },
  carteInactive: { borderColor: '#fdba74' },
  tete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teteEntre: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  pastille: { width: 11, height: 11, borderRadius: 6 },
  nom: { fontSize: 15, fontWeight: '800', color: colors.text },
  fonction: { fontSize: 12, color: colors.textMuted, marginLeft: 19, marginBottom: 6 },
  fonctionSimple: { fontSize: 12, color: colors.textMuted },
  ligne: { fontSize: 13, color: colors.text, lineHeight: 20 },
  gras: { fontWeight: '700' },
  alerte: { color: colors.danger, fontWeight: '700' },
  mois: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  moisTexte: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 6, marginBottom: 4 },
  saisies: { flexDirection: 'row', gap: 8 },
  champ: {
    borderWidth: 1,
    borderColor: colors.borderChamp,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#fff',
  },
  totalDu: { fontSize: 15, fontWeight: '800', color: colors.primaryDark, marginTop: 8 },
  totalMois: { backgroundColor: colors.primaryLight },
  totalTexte: { fontSize: 15, fontWeight: '800', color: colors.primaryDarker, textAlign: 'center' },
})
