import React, { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import http from '../api/http'
import { colors } from '../theme'
import { Badge, Btn, Card, Input, Modale, SectionTitle } from './ui'
import ListeSelect from './ListeSelect'
import DateField from './DateField'

/**
 * Fiche de référence / contre-référence (même modèle que la fiche officielle HGF).
 * Accessible pour tous les patients sauf externes — consultation et maternité.
 * Enregistrée dans le dossier du patient ; impression via l'agent du poste.
 */
export default function ReferenceFicheMobile({
  passage,
}: {
  passage: { id: number; patient?: { nom?: string; prenom?: string; age?: string; sexe?: string; numeroCmu?: string; numeroDossier?: string; ville?: string; quartier?: string; telephone?: string } | null; service?: { nom?: string } | null }
}) {
  const [fiches, setFiches] = useState<any[]>([])
  const [formVisible, setFormVisible] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})
  const [contreVisible, setContreVisible] = useState(false)
  const [contreCible, setContreCible] = useState<any>(null)
  const [contreForm, setContreForm] = useState<Record<string, any>>({})
  const [enCours, setEnCours] = useState(false)

  async function charger() {
    try {
      const { data } = await http.get(`/references/passages/${passage.id}`)
      setFiches(data ?? [])
    } catch {
      setFiches([])
    }
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage.id])

  function ouvrirForm() {
    const p = passage.patient ?? {}
    setForm({
      transfertUrgent: null,
      nomPrenoms: `${p.nom ?? ''} ${p.prenom ?? ''}`.trim(),
      age: p.age ?? '',
      sexe: p.sexe ?? '',
      numeroSecu: p.numeroCmu ?? '',
      adresseTel: [p.ville, p.quartier, p.telephone].filter(Boolean).join(' / '),
      numeroRegistreSig: p.numeroDossier ?? '',
      districtSanitaire: '',
      dateAdmission: '',
      heureAdmission: '',
      agentNom: '',
      agentPrenom: '',
      agentContact: '',
      institutionReference: '',
      serviceReference: passage.service?.nom ?? '',
      dateHeureDecision: '',
      diagnostic: '',
      examensCliniques: '',
      antecedentsMedicaux: '',
      antecedentsChirurgicaux: '',
      antecedentsGyneco: '',
      allergie: '',
      groupeSanguin: '',
      motifReference: '',
      traitementRecu: '',
      depuisQuand: '',
      modeEvacuation: '',
      modeEvacuationAutre: '',
      dateHeureDepart: '',
    })
    setFormVisible(true)
  }

  function setF(key: string, value: any) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function enregistrer() {
    setEnCours(true)
    try {
      await http.post(`/references/passages/${passage.id}`, form)
      Alert.alert('✅ Fiche enregistrée', 'La fiche reste dans le dossier du patient.')
      setFormVisible(false)
      await charger()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? "Impossible d'enregistrer la fiche.")
    } finally {
      setEnCours(false)
    }
  }

  function ouvrirContreReference(f: any) {
    setContreCible(f)
    setContreForm({
      contreNomPrenoms: f.contreNomPrenoms ?? f.nomPrenoms ?? '',
      contreNumeroDossier: f.contreNumeroDossier ?? '',
      contreDateArrivee: f.contreDateArrivee ?? '',
      contreDiagnostic: f.contreDiagnostic ?? '',
      contreHospitalise: f.contreHospitalise ?? null,
      contreTraitement: f.contreTraitement ?? '',
      contreMedecin: f.contreMedecin ?? '',
      contreDateSignature: f.contreDateSignature ?? '',
    })
    setContreVisible(true)
  }

  function setC(key: string, value: any) {
    setContreForm((f) => ({ ...f, [key]: value }))
  }

  async function enregistrerContreReference() {
    if (!contreCible) return
    setEnCours(true)
    try {
      await http.patch(`/references/${contreCible.id}`, contreForm)
      Alert.alert('✅ Contre-référence enregistrée')
      setContreVisible(false)
      await charger()
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.message ?? "Impossible d'enregistrer la contre-référence.")
    } finally {
      setEnCours(false)
    }
  }

  function imprimer(f: any) {
    Alert.alert('🖨️ Imprimer la fiche ?', `${f.numero} — impression A4 au poste.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Imprimer',
        onPress: async () => {
          try {
            const { data } = await http.post(`/references/${f.id}/imprimer`)
            Alert.alert('🖨️ Impression A4', data.message ?? 'Fiche envoyée à l’imprimante du poste.')
          } catch (e: any) {
            Alert.alert('Erreur', e.response?.data?.message ?? 'Impression impossible.')
          }
        },
      },
    ])
  }

  return (
    <View>
      {fiches.length === 0 ? (
        <Text style={styles.vide}>Aucune fiche de référence pour ce patient.</Text>
      ) : (
        fiches.map((f: any) => (
          <View key={f.id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitre}>{f.numero} — {new Date(f.createdAt).toLocaleDateString('fr-FR')}</Text>
              <Text style={styles.itemSous}>{f.motifReference || 'Motif non renseigné'}</Text>
              <Badge label={f.contreDiagnostic ? 'Contre-référence reçue' : 'En attente'} tone={f.contreDiagnostic ? 'success' : 'muted'} />
            </View>
            <Btn title="✏️" small variant="outline" onPress={() => ouvrirContreReference(f)} />
            <Btn title="🖨️" small onPress={() => imprimer(f)} />
          </View>
        ))
      )}

      <View style={{ marginTop: 10 }}>
        <Btn title="＋ Nouvelle fiche de référence (évacuation)" onPress={ouvrirForm} />
      </View>

      {/* Modale : nouvelle fiche (partie 1) */}
      <Modale
        visible={formVisible}
        titre="📤 Fiche de référence"
        sousTitre="1- Informations de référence (préremplies depuis le dossier)"
        onFermer={() => setFormVisible(false)}
        actions={
          <>
            <Btn title="Annuler" variant="outline" onPress={() => setFormVisible(false)} />
            <Btn title="💾 Enregistrer" onPress={enregistrer} loading={enCours} />
          </>
        }
      >
        <Input label="Transfert urgent">
          <ListeSelect
            value={form.transfertUrgent}
            options={[
              { value: true as any, label: 'OUI' },
              { value: false as any, label: 'NON' },
            ]}
            placeholder="— Choisir —"
            onChange={(v) => setF('transfertUrgent', v as boolean | null)}
          />
        </Input>
        <Input label="Nom et Prénoms" value={form.nomPrenoms ?? ''} onChangeText={(t) => setF('nomPrenoms', t)} />
        <Input label="Âge" value={form.age ?? ''} onChangeText={(t) => setF('age', t)} />
        <Input label="Sexe" value={form.sexe ?? ''} onChangeText={(t) => setF('sexe', t)} />
        <Input label="N° Sécurité sociale" value={form.numeroSecu ?? ''} onChangeText={(t) => setF('numeroSecu', t)} />
        <Input label="Adresse / Tél" value={form.adresseTel ?? ''} onChangeText={(t) => setF('adresseTel', t)} />
        <Input label="N° Registre SIG" value={form.numeroRegistreSig ?? ''} onChangeText={(t) => setF('numeroRegistreSig', t)} />
        <Input label="District sanitaire" value={form.districtSanitaire ?? ''} onChangeText={(t) => setF('districtSanitaire', t)} />
        <DateField label="Date d'admission" value={form.dateAdmission ?? ''} onChange={(v) => setF('dateAdmission', v)} />
        <Input label="Heure d'admission" value={form.heureAdmission ?? ''} onChangeText={(t) => setF('heureAdmission', t)} />
        <Input label="Agent qui réfère (nom)" value={form.agentNom ?? ''} onChangeText={(t) => setF('agentNom', t)} />
        <Input label="Prénom de l'agent" value={form.agentPrenom ?? ''} onChangeText={(t) => setF('agentPrenom', t)} />
        <Input label="Contact de l'agent" value={form.agentContact ?? ''} onChangeText={(t) => setF('agentContact', t)} />
        <Input label="Institution de référence" value={form.institutionReference ?? ''} onChangeText={(t) => setF('institutionReference', t)} />
        <Input label="Service" value={form.serviceReference ?? ''} onChangeText={(t) => setF('serviceReference', t)} />
        <Input label="Date/heure de décision d'évacuation" value={form.dateHeureDecision ?? ''} onChangeText={(t) => setF('dateHeureDecision', t)} />
        <Input label="Diagnostic" value={form.diagnostic ?? ''} onChangeText={(t) => setF('diagnostic', t)} multiline />
        <Input label="Examens cliniques" value={form.examensCliniques ?? ''} onChangeText={(t) => setF('examensCliniques', t)} multiline />
        <Input label="Antécédents médicaux" value={form.antecedentsMedicaux ?? ''} onChangeText={(t) => setF('antecedentsMedicaux', t)} />
        <Input label="Antécédents chirurgicaux" value={form.antecedentsChirurgicaux ?? ''} onChangeText={(t) => setF('antecedentsChirurgicaux', t)} />
        <Input label="Antécédents gynéco-obstétricaux" value={form.antecedentsGyneco ?? ''} onChangeText={(t) => setF('antecedentsGyneco', t)} />
        <Input label="Allergie" value={form.allergie ?? ''} onChangeText={(t) => setF('allergie', t)} />
        <Input label="Groupe sanguin et Rhésus" value={form.groupeSanguin ?? ''} onChangeText={(t) => setF('groupeSanguin', t)} />
        <Input label="Motif de référence" value={form.motifReference ?? ''} onChangeText={(t) => setF('motifReference', t)} multiline />
        <Input label="Traitement reçu au centre" value={form.traitementRecu ?? ''} onChangeText={(t) => setF('traitementRecu', t)} multiline />
        <Input label="Depuis quand" value={form.depuisQuand ?? ''} onChangeText={(t) => setF('depuisQuand', t)} />
        <Input label="Mode d'évacuation">
          <ListeSelect
            value={form.modeEvacuation ?? ''}
            options={[
              { value: 'AMBULANCE', label: 'Ambulance' },
              { value: 'VEHICULE_PERSONNEL', label: 'Taxi ou véhicule personnel' },
              { value: 'AUTRE', label: 'Autre (à préciser)' },
            ]}
            placeholder="— Choisir —"
            onChange={(v) => setF('modeEvacuation', v as string)}
          />
        </Input>
        <Input label="Autre (à préciser)" value={form.modeEvacuationAutre ?? ''} onChangeText={(t) => setF('modeEvacuationAutre', t)} />
        <Input label="Date, heure de départ effectif" value={form.dateHeureDepart ?? ''} onChangeText={(t) => setF('dateHeureDepart', t)} />
      </Modale>

      {/* Modale : contre-référence (partie 2) */}
      <Modale
        visible={contreVisible}
        titre={`✏️ Contre-référence — ${contreCible?.numero ?? ''}`}
        sousTitre="2- Informations de contre-référence (à recevoir par l'agent qui a référé)"
        onFermer={() => setContreVisible(false)}
        actions={
          <>
            <Btn title="Annuler" variant="outline" onPress={() => setContreVisible(false)} />
            <Btn title="💾 Enregistrer" onPress={enregistrerContreReference} loading={enCours} />
          </>
        }
      >
        <Input label="Nom et Prénoms du malade" value={contreForm.contreNomPrenoms ?? ''} onChangeText={(t) => setC('contreNomPrenoms', t)} />
        <Input label="Numéro du dossier" value={contreForm.contreNumeroDossier ?? ''} onChangeText={(t) => setC('contreNumeroDossier', t)} />
        <Input label="Date/heure d'arrivée" value={contreForm.contreDateArrivee ?? ''} onChangeText={(t) => setC('contreDateArrivee', t)} />
        <Input label="Diagnostic retenu à la sortie" value={contreForm.contreDiagnostic ?? ''} onChangeText={(t) => setC('contreDiagnostic', t)} multiline />
        <Input label="Le patient a été hospitalisé">
          <ListeSelect
            value={contreForm.contreHospitalise}
            options={[
              { value: true as any, label: 'OUI' },
              { value: false as any, label: 'NON' },
            ]}
            placeholder="— Choisir —"
            onChange={(v) => setC('contreHospitalise', v as boolean | null)}
          />
        </Input>
        <Input label="Traitement à suivre" value={contreForm.contreTraitement ?? ''} onChangeText={(t) => setC('contreTraitement', t)} multiline />
        <Input label="Nom et fonction du médecin responsable" value={contreForm.contreMedecin ?? ''} onChangeText={(t) => setC('contreMedecin', t)} />
        <Input label="Date et signature" value={contreForm.contreDateSignature ?? ''} onChangeText={(t) => setC('contreDateSignature', t)} />
      </Modale>
    </View>
  )
}

const styles = StyleSheet.create({
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
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 12 },
})
