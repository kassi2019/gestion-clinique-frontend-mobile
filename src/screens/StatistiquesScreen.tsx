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
import { Btn, Card, Screen, SectionTitle } from '../components/ui'

const MENUS = [
  { code: 'tableau-bord', label: 'Tableau de bord', icon: '📊' },
  { code: 'frequentation', label: 'Fréquentation', icon: '🏥' },
  { code: 'recettes', label: 'Recettes', icon: '💰' },
  { code: 'laboratoire', label: 'Laboratoire', icon: '🧪' },
  { code: 'imagerie', label: 'Imagerie', icon: '🩻' },
  { code: 'hospitalisation', label: 'Hospitalisation', icon: '🛏️' },
  { code: 'pharmacie', label: 'Pharmacie', icon: '💊' },
  { code: 'maternite', label: 'Maternité', icon: '🤰' },
]

function Kpi({ label, valeur, icon }: { label: string; valeur: any; icon: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiIcone}>{icon}</Text>
      <Text style={styles.kpiValeur}>{valeur ?? '—'}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  )
}

function Tableau({ colonnes, lignes }: { colonnes: { cle: string; libelle: string }[]; lignes: any[] }) {
  return (
    <View style={styles.tableau}>
      <View style={styles.ligneTete}>
        {colonnes.map((c) => (
          <Text key={c.cle} style={[styles.cellule, styles.celluleTete, { flex: 1 }]}>
            {c.libelle}
          </Text>
        ))}
      </View>
      {lignes.length === 0 ? (
        <Text style={styles.vide}>Aucune donnée sur la période.</Text>
      ) : (
        lignes.map((l, i) => (
          <View key={i} style={styles.ligne}>
            {colonnes.map((c) => (
              <Text key={c.cle} style={[styles.cellule, { flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                {l[c.cle] ?? '—'}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  )
}

export default function StatistiquesScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id ?? 1

  const [rubrique, setRubrique] = useState('tableau-bord')
  const [donnees, setDonnees] = useState<any>(null)
  const [chargement, setChargement] = useState(false)

  // Période personnalisable (comme le web)
  function aujourdhui(): string {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const j = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${j}`
  }
  const [debut, setDebut] = useState(aujourdhui())
  const [fin, setFin] = useState(aujourdhui())

  const ENDPOINTS: Record<string, string> = {
    'tableau-bord': '/statistiques/tableau-bord',
    frequentation: '/statistiques/frequentation',
    recettes: '/statistiques/recettes',
    laboratoire: '/statistiques/laboratoire',
    imagerie: '/statistiques/imagerie',
    hospitalisation: '/statistiques/hospitalisation',
    pharmacie: '/statistiques/pharmacie',
    maternite: '/statistiques/maternite',
  }

  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

  async function charger(code: string, debutParam = debut, finParam = fin) {
    if (!DATE_REGEX.test(debutParam) || !DATE_REGEX.test(finParam)) {
      Alert.alert('Période', 'Dates au format AAAA-MM-JJ.')
      return
    }
    if (debutParam > finParam) {
      Alert.alert('Période', 'La date de début doit être avant (ou égale à) la date de fin.')
      return
    }
    setChargement(true)
    try {
      const params: any =
        code === 'tableau-bord'
          ? { cliniqueId, jour: debutParam } // le tableau de bord est « un jour »
          : { cliniqueId, debut: debutParam, fin: finParam }
      const { data } = await http.get(ENDPOINTS[code], { params })
      setDonnees(data)
    } catch {
      setDonnees(null)
    } finally {
      setChargement(false)
    }
  }

  useEffect(() => {
    charger(rubrique)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubrique])

  const fmtF = (x: any) => (x == null ? '—' : Number(x).toLocaleString('fr-FR'))

  return (
    <Screen padded={false}>
      <View style={styles.bandeau}>
        <TouchableOpacity style={styles.btnRetour} onPress={() => navigation.goBack()}>
          <Text style={styles.btnRetourTexte}>← Modules</Text>
        </TouchableOpacity>
        <Text style={styles.titre}>📊 Statistiques</Text>
        <Text style={styles.periode}>Période : {donnees?.periode ?? `${debut} → ${fin}`}</Text>
        <View style={styles.periodeLigne}>
          <TextInput
            style={styles.periodeChamp}
            placeholder="Du : AAAA-MM-JJ"
            value={debut}
            onChangeText={setDebut}
          />
          <TextInput
            style={styles.periodeChamp}
            placeholder="Au : AAAA-MM-JJ"
            value={fin}
            onChangeText={setFin}
          />
          <Btn title="Appliquer" small onPress={() => charger(rubrique)} />
        </View>
      </View>

      {/* Menu des rubriques (défilement horizontal) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.menu} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {MENUS.map((m) => (
          <TouchableOpacity
            key={m.code}
            style={[styles.menuItem, rubrique === m.code && styles.menuItemActif]}
            onPress={() => setRubrique(m.code)}
          >
            <Text style={[styles.menuTexte, rubrique === m.code && styles.menuTexteActif]}>
              {m.icon} {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {chargement || !donnees ? (
          <Text style={styles.vide}>{chargement ? 'Chargement…' : 'Aucune donnée.'}</Text>
        ) : (
          <>
            {rubrique === 'tableau-bord' ? (
              <View style={styles.kpis}>
                <Kpi icon="🏥" label="Patients reçus" valeur={donnees.passages} />
                <Kpi icon="🩺" label="Consultations" valeur={donnees.consultations} />
                <Kpi icon="🚶" label="Externes" valeur={donnees.externes} />
                <Kpi icon="💰" label="Paiements" valeur={donnees.paiements?.nombre} />
                <Kpi icon="💵" label="Encaissé (F)" valeur={fmtF(donnees.paiements?.montant)} />
                <Kpi icon="🧪" label="Examens labo" valeur={donnees.examensLabo} />
                <Kpi icon="🩻" label="Examens imagerie" valeur={donnees.examensImagerie} />
                <Kpi icon="🛏️" label="Hospitalisés" valeur={donnees.hospitalisationsEnCours} />
                <Kpi icon="📊" label="Occupation lits" valeur={`${donnees.lits?.occupes ?? 0}/${donnees.lits?.total ?? 0}`} />
              </View>
            ) : rubrique === 'frequentation' ? (
              <>
                <View style={styles.kpis}>
                  <Kpi icon="🏥" label="Patients reçus" valeur={donnees.passages} />
                  <Kpi icon="🧍" label="Internes" valeur={donnees.internes} />
                  <Kpi icon="🚶" label="Externes" valeur={donnees.externes} />
                  <Kpi icon="🩺" label="Consultations" valeur={donnees.consultations} />
                </View>
                <Card>
                  <SectionTitle>Par service</SectionTitle>
                  <Tableau colonnes={[{ cle: 'service', libelle: 'Service' }, { cle: 'nombre', libelle: 'Passages' }]} lignes={donnees.parService ?? []} />
                </Card>
                <Card>
                  <SectionTitle>Par jour</SectionTitle>
                  <Tableau colonnes={[{ cle: 'jour', libelle: 'Jour' }, { cle: 'nombre', libelle: 'Passages' }]} lignes={donnees.parJour ?? []} />
                </Card>
              </>
            ) : rubrique === 'recettes' ? (
              <>
                <View style={styles.kpis}>
                  <Kpi icon="💰" label="Paiements" valeur={donnees.nombre} />
                  <Kpi icon="💵" label="Total (F)" valeur={fmtF(donnees.total)} />
                </View>
                <Card>
                  <SectionTitle>Par mode de paiement</SectionTitle>
                  <Tableau colonnes={[{ cle: 'mode', libelle: 'Mode' }, { cle: 'nombre', libelle: 'N' }, { cle: 'montant', libelle: 'Montant (F)' }]} lignes={(donnees.parMode ?? []).map((l: any) => ({ ...l, montant: fmtF(l.montant) }))} />
                </Card>
                <Card>
                  <SectionTitle>Par service</SectionTitle>
                  <Tableau colonnes={[{ cle: 'service', libelle: 'Service' }, { cle: 'montant', libelle: 'Montant (F)' }]} lignes={(donnees.parService ?? []).map((l: any) => ({ ...l, montant: fmtF(l.montant) }))} />
                </Card>
                <Card>
                  <SectionTitle>Par type d'acte</SectionTitle>
                  <Tableau colonnes={[{ cle: 'type', libelle: 'Type' }, { cle: 'montant', libelle: 'Montant (F)' }]} lignes={(donnees.parType ?? []).map((l: any) => ({ ...l, montant: fmtF(l.montant) }))} />
                </Card>
              </>
            ) : rubrique === 'laboratoire' ? (
              <>
                <View style={styles.kpis}>
                  <Kpi icon="🧪" label="Examens" valeur={donnees.total} />
                </View>
                <Card>
                  <SectionTitle>Par examen</SectionTitle>
                  <Tableau colonnes={[{ cle: 'libelle', libelle: 'Examen' }, { cle: 'nombre', libelle: 'N' }]} lignes={donnees.parLibelle ?? []} />
                </Card>
                <Card>
                  <SectionTitle>Par statut</SectionTitle>
                  <Tableau colonnes={[{ cle: 'statut', libelle: 'Statut' }, { cle: 'nombre', libelle: 'N' }]} lignes={donnees.parStatut ?? []} />
                </Card>
              </>
            ) : rubrique === 'imagerie' ? (
              <>
                <View style={styles.kpis}>
                  <Kpi icon="🩻" label="Examens" valeur={donnees.total} />
                </View>
                <Card>
                  <SectionTitle>Par examen</SectionTitle>
                  <Tableau colonnes={[{ cle: 'libelle', libelle: 'Examen' }, { cle: 'nombre', libelle: 'N' }]} lignes={donnees.parLibelle ?? []} />
                </Card>
                <Card>
                  <SectionTitle>Par statut</SectionTitle>
                  <Tableau colonnes={[{ cle: 'statut', libelle: 'Statut' }, { cle: 'nombre', libelle: 'N' }]} lignes={donnees.parStatut ?? []} />
                </Card>
              </>
            ) : rubrique === 'hospitalisation' ? (
              <>
                <View style={styles.kpis}>
                  <Kpi icon="🛏️" label="Entrées" valeur={donnees.entrees} />
                  <Kpi icon="🚪" label="Sorties" valeur={donnees.sorties} />
                  <Kpi icon="⏳" label="En cours" valeur={donnees.enCours} />
                  <Kpi icon="📅" label="Jours facturés" valeur={donnees.joursFactures} />
                  <Kpi icon="💵" label="Montant (F)" valeur={fmtF(donnees.montantFacture)} />
                </View>
              </>
            ) : rubrique === 'pharmacie' ? (
              <>
                <View style={styles.kpis}>
                  <Kpi icon="💊" label="Ventes (F)" valeur={fmtF(donnees.totalVentes)} />
                  <Kpi icon="📦" label="Unités vendues" valeur={donnees.quantitesVendues} />
                </View>
                <Card>
                  <SectionTitle>Top médicaments vendus</SectionTitle>
                  <Tableau colonnes={[{ cle: 'medicament', libelle: 'Médicament' }, { cle: 'quantite', libelle: 'Qté' }, { cle: 'montant', libelle: 'Montant (F)' }]} lignes={(donnees.topMedicaments ?? []).map((l: any) => ({ ...l, montant: fmtF(l.montant) }))} />
                </Card>
                <Card>
                  <SectionTitle>Stocks faibles</SectionTitle>
                  <Tableau colonnes={[{ cle: 'medicament', libelle: 'Médicament' }, { cle: 'stock', libelle: 'Stock' }, { cle: 'seuilAlerte', libelle: 'Seuil' }]} lignes={donnees.stocksFaibles ?? []} />
                </Card>
                <Card>
                  <SectionTitle>Péremptions proches (≤ 30 j)</SectionTitle>
                  <Tableau colonnes={[{ cle: 'medicament', libelle: 'Médicament' }, { cle: 'lot', libelle: 'Lot' }, { cle: 'quantite', libelle: 'Qté' }, { cle: 'peremption', libelle: 'Péremption' }]} lignes={donnees.peremptions ?? []} />
                </Card>
              </>
            ) : (
              <>
                <View style={styles.kpis}>
                  <Kpi icon="🤰" label="Actes" valeur={donnees.total} />
                  <Kpi icon="💵" label="Montant (F)" valeur={fmtF(donnees.montant)} />
                </View>
                <Card>
                  <SectionTitle>Actes de maternité</SectionTitle>
                  <Tableau colonnes={[{ cle: 'acte', libelle: 'Acte' }, { cle: 'nombre', libelle: 'N' }, { cle: 'montant', libelle: 'Montant (F)' }]} lignes={(donnees.parActe ?? []).map((l: any) => ({ ...l, montant: fmtF(l.montant) }))} />
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
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
  titre: { fontSize: 22, fontWeight: '800', color: colors.primaryDarker },
  periode: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  periodeLigne: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  periodeChamp: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  menu: { flexGrow: 0, marginBottom: 10 },
  menuItem: {
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  menuItemActif: { backgroundColor: colors.primary, borderColor: colors.primary },
  menuTexte: { fontWeight: '700', color: colors.textMuted, fontSize: 13 },
  menuTexteActif: { color: '#fff' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpi: {
    width: '30.5%',
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  kpiIcone: { fontSize: 20 },
  kpiValeur: { fontSize: 18, fontWeight: '800', color: colors.primaryDarker, marginTop: 4 },
  kpiLabel: { fontSize: 10.5, color: colors.textMuted, textAlign: 'center', marginTop: 2, textTransform: 'uppercase', fontWeight: '700' },
  tableau: { width: '100%' },
  ligneTete: { flexDirection: 'row', backgroundColor: '#f1f5f9' },
  ligne: { flexDirection: 'row', borderBottomColor: colors.border, borderBottomWidth: 1 },
  cellule: { padding: 8, fontSize: 13, color: colors.text },
  celluleTete: { fontWeight: '800', fontSize: 11.5, color: colors.textMuted, textTransform: 'uppercase' },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
})
