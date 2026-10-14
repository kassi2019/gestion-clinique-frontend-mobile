import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import http from '../api/http'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'
import { Badge, Bandeau, Btn, Card, EtatVide, Screen, SectionTitle } from '../components/ui'

type Ligne = {
  id: number
  debut: string
  derniereActivite: string | null
  heures: number
  minutesPresence: number
  present: boolean
  agent: { nom: string; prenom: string; fonction: string; role: string }
}

function duree(heures: number) {
  const min = Math.max(0, Math.round((heures ?? 0) * 60))
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

/**
 * Module Finances (mobile) : qui est en service maintenant, en temps réel.
 * Les tarifs, la validation des services et les fiches de vacation se gèrent sur le web.
 */
export default function FinancesScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { user } = useAuth()
  const cliniqueId = user?.clinique?.id
  const [direct, setDirect] = useState<{ lignes: Ligne[]; total: number; presents: number; maintenant?: string }>({
    lignes: [],
    total: 0,
    presents: 0,
  })
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(false)

  async function charger() {
    setChargement(true)
    try {
      const { data } = await http.get('/finances/en-service', { params: { cliniqueId } })
      setDirect(data)
      setErreur('')
    } catch (e: any) {
      setErreur(e.response?.data?.message ?? 'Liste du personnel en service indisponible.')
    } finally {
      setChargement(false)
    }
  }

  // Mise à jour automatique toutes les 30 secondes
  useEffect(() => {
    charger()
    const minuterie = setInterval(charger, 30000)
    return () => clearInterval(minuterie)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const depuis = (d: string | null, debut: string) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(d ?? debut).getTime()) / 60000))
    return min < 60 ? `${min} min` : duree(min / 60)
  }

  return (
    <Screen padded={false}>
      <Bandeau titre="💼 Finances" onRetour={() => navigation.goBack()} />
      <View style={styles.contenu}>
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
          <Btn title="🔄 Actualiser" small variant="outline" onPress={charger} loading={chargement} />
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

        <Text style={styles.note}>
          Les tarifs, la validation des services et les fiches de vacation se gèrent depuis la version web.
        </Text>
      </View>
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
  pastille: { width: 11, height: 11, borderRadius: 6 },
  nom: { fontSize: 15, fontWeight: '800', color: colors.text },
  fonction: { fontSize: 12, color: colors.textMuted, marginLeft: 19, marginBottom: 6 },
  ligne: { fontSize: 13, color: colors.text, lineHeight: 20 },
  gras: { fontWeight: '700' },
})
