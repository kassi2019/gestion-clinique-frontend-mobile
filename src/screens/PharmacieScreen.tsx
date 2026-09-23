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
import { ApercuTexte, Badge, Btn, Card, Input, Modale, Onglets, Screen, SectionTitle } from '../components/ui'
import ListeSelect from '../components/ListeSelect'

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
  const [ongletPharma, setOngletPharma] = useState<'ordonnances' | 'stocks' | 'consommables'>('ordonnances')
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
    if (ongletPharma === 'stocks') {
      chargerAlertes()
    }
    if (ongletPharma === 'consommables') {
      chargerConsommables()
    }
    if (ongletPharma === 'ordonnances') {
      chargerDispensees()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ongletPharma])

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
        <View style={{ padding: 16 }}>
          <Onglets
            actif={ongletPharma}
            onChange={(k) => setOngletPharma(k as typeof ongletPharma)}
            tabs={[
              { key: 'ordonnances', label: 'Ordonnances', count: dispensees.length },
              { key: 'stocks', label: 'Stocks', count: alertes.stockBas.length },
              { key: 'consommables', label: 'Consommables' },
            ]}
          />

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
              <Input
                label="Rechercher un médicament"
                value={rechercheStock}
                onChangeText={setRechercheStock}
                placeholder="Nom du médicament"
              />
              {stocks.length === 0 ? (
                <Text style={styles.vide}>Aucun médicament en stock.</Text>
              ) : (
                stocks.map((m) => (
                  <Card key={m.id}>
                    <Text style={styles.itemTitre}>{m.nom}</Text>
                    <Text style={styles.itemSous}>
                      Stock : {m.stock} · Seuil : {m.seuilAlerte ?? '—'} ·{' '}
                      {Number(m.prixVente ?? 0).toLocaleString('fr-FR')} F
                    </Text>
                    <View style={styles.actionsLigne}>
                      <Btn title="+ Entrée" small variant="outline" onPress={() => ouvrirEntree(m)} />
                      <Btn title="Inventaire" small variant="outline" onPress={() => ouvrirInventaire(m)} />
                      <Btn title="Mouvements" small variant="outline" onPress={() => ouvrirMouvements(m)} />
                    </View>
                  </Card>
                ))
              )}
            </>
          ) : null}

          {ongletPharma === 'consommables' ? (
            <>
              <Btn
                title="+ Nouveau consommable"
                small
                variant="outline"
                onPress={() => setNouveauConsoVisible(true)}
              />
              {consommables.length === 0 ? (
                <Text style={styles.vide}>Aucun consommable.</Text>
              ) : (
                consommables.map((c) => (
                  <Card key={c.id}>
                    <Text style={styles.itemTitre}>{c.nom}</Text>
                    <Text style={styles.itemSous}>
                      Quantité : {c.quantite} · Seuil : {c.seuilAlerte ?? '—'}
                    </Text>
                    <View style={styles.actionsLigne}>
                      <Btn title="+ Entrée" small variant="outline" onPress={() => ouvrirMouvementConso(c, 'ENTREE')} />
                      <Btn title="− Sortie" small variant="outline" onPress={() => ouvrirMouvementConso(c, 'SORTIE')} />
                    </View>
                  </Card>
                ))
              )}
            </>
          ) : null}
        </View>
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
          <Text style={styles.vide}>Aucun mouvement.</Text>
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
