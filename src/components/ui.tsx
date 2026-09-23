import React from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius } from '../theme'

/** Champ de saisie avec libellé (ou conteneur pour un sélecteur personnalisé). */
export function Input({
  label,
  required,
  children,
  onChangeText,
  autoCapitalize = 'characters',
  secureTextEntry,
  keyboardType,
  ...props
}: TextInputProps & { label?: string; required?: boolean; children?: React.ReactNode }) {
  // Calibrage global : saisie en MAJUSCULES sur tous les formulaires.
  // Exclusions : mots de passe et claviers numériques/téléphone/e-mail.
  const CLAVIERS_BRUTS = ['numeric', 'number-pad', 'decimal-pad', 'phone-pad', 'email-address']
  const brut = secureTextEntry || (keyboardType && CLAVIERS_BRUTS.includes(keyboardType))
  const handleChange = (t: string) => {
    onChangeText?.(brut ? t : t.toUpperCase())
  }
  return (
    <View style={styles.inputWrap}>
      {label ? (
        <Text style={styles.inputLabel}>
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      {children ?? (
        <TextInput
          placeholderTextColor="#94a3b8"
          style={styles.input}
          onChangeText={handleChange}
          autoCapitalize={brut ? 'none' : autoCapitalize}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          {...props}
        />
      )}
    </View>
  )
}

/** Bouton primaire / secondaire / danger. */
export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'outline' | 'danger'
  disabled?: boolean
  loading?: boolean
  small?: boolean
  style?: object
}) {
  const base = [styles.btn, small && styles.btnSmall, styles[`btn_${variant}`], disabled && styles.btnDisabled, style]
  return (
    <Pressable style={base} onPress={onPress} disabled={disabled || loading}>
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'outline' ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.btnText, styles[`btnText_${variant}`], disabled && styles.btnTextDisabled]}>
          {title}
        </Text>
      )}
    </Pressable>
  )
}

/** Badge de statut. */
export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'muted' }) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  )
}

/** Carte blanche. */
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>
}

/** Conteneur d'écran avec fond doux + scroll (respecte la zone sûre du téléphone). */
export function Screen({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        padded && styles.screenPadded,
        { paddingTop: (padded ? 16 : 0) + insets.top + 10 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}

/** Titre de section. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

/** Ligne libellé / valeur (fiche patient). */
export function InfoLigne({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.infoLigne}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

/** Aperçu d'un ticket/reçu (texte monospace). */
export function ApercuTexte({ contenu }: { contenu: string }) {
  return (
    <View style={styles.apercu}>
      <Text style={styles.apercuTitre}>🧾 Aperçu (imprimé au poste)</Text>
      <ScrollView style={styles.apercuScroll}>
        <Text style={styles.apercuTexte}>{contenu}</Text>
      </ScrollView>
    </View>
  )
}

/** Bandeau d'écran : bouton retour + titre (remplace les styles dupliqués). */
export function Bandeau({ titre, onRetour }: { titre: string; onRetour: () => void }) {
  return (
    <View style={styles.bandeau}>
      <TouchableOpacity style={styles.btnRetour} onPress={onRetour}>
        <Text style={styles.btnRetourTexte}>← Modules</Text>
      </TouchableOpacity>
      <Text style={styles.titre}>{titre}</Text>
    </View>
  )
}

/** Onglets segmentés avec compteur optionnel (comme .tabs-nav du web). */
export function Onglets({
  tabs,
  actif,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[]
  actif: string
  onChange: (key: string) => void
}) {
  return (
    <View style={styles.onglets}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[styles.onglet, actif === t.key && styles.ongletActif]}
          onPress={() => onChange(t.key)}
        >
          <Text style={[styles.ongletTexte, actif === t.key && styles.ongletTexteActif]}>{t.label}</Text>
          {t.count != null ? (
            <View style={[styles.ongletCount, actif === t.key && styles.ongletCountActif]}>
              <Text style={[styles.ongletCountTexte, actif === t.key && styles.ongletCountTexteActif]}>
                {t.count}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  )
}

/** Chips à choix unique (tolère une valeur null = non renseigné). */
export function Chips({
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

/** Pagination « ← Précédent | Page X / Y | Suivant → » (équivalent PaginationBar web). */
export function PaginationBar({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <View style={styles.pagination}>
      <Btn small variant="outline" title="← Précédent" disabled={page <= 1} onPress={() => onPage(page - 1)} />
      <Text style={styles.paginationTexte}>
        Page {page} / {totalPages}
      </Text>
      <Btn small variant="outline" title="Suivant →" disabled={page >= totalPages} onPress={() => onPage(page + 1)} />
    </View>
  )
}

/** Modale bottom-sheet générique (titre + fermeture + contenu scrollable + actions).
 *  `centree` : la carte s'affiche au CENTRE de l'écran (formulaires courts). */
export function Modale({
  visible,
  titre,
  sousTitre,
  onFermer,
  children,
  actions,
  centree = false,
}: {
  visible: boolean
  titre?: string
  sousTitre?: string
  onFermer: () => void
  children: React.ReactNode
  actions?: React.ReactNode
  centree?: boolean
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <View style={[styles.modalVoile, centree && styles.modalVoileCentree]}>
        <View style={[styles.modalCarte, centree && styles.modalCarteCentree]}>
          <View style={styles.modalEntete}>
            <View style={{ flex: 1 }}>
              {titre ? <Text style={styles.modalTitre}>{titre}</Text> : null}
              {sousTitre ? <Text style={styles.modalSousTitre}>{sousTitre}</Text> : null}
            </View>
            <TouchableOpacity onPress={onFermer} style={styles.modalFermer}>
              <Text style={styles.modalFermerTexte}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
            {children}
          </ScrollView>
          {actions ? <View style={styles.modalActions}>{actions}</View> : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenPadded: { padding: 16, paddingBottom: 40 },
  inputWrap: { marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  btn_primary: { backgroundColor: colors.primary },
  btn_outline: { backgroundColor: 'transparent', borderColor: colors.primary, borderWidth: 1 },
  btn_danger: { backgroundColor: colors.danger },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 15, fontWeight: '700' },
  btnText_primary: { color: '#fff' },
  btnText_outline: { color: colors.primary },
  btnText_danger: { color: '#fff' },
  btnTextDisabled: { color: '#fff' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badge_success: { backgroundColor: colors.successBg },
  badge_warning: { backgroundColor: colors.warningBg },
  badge_danger: { backgroundColor: colors.dangerBg },
  badge_muted: { backgroundColor: colors.border },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeText_success: { color: '#166534' },
  badgeText_warning: { color: '#92400e' },
  badgeText_danger: { color: '#991b1b' },
  badgeText_muted: { color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginVertical: 10,
  },
  infoLigne: { marginBottom: 6 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  infoValue: { fontSize: 14.5, color: colors.text, fontWeight: '600' },
  apercu: {
    backgroundColor: '#fff',
    borderColor: '#134e4a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  apercuTitre: { fontSize: 13, fontWeight: '800', color: '#134e4a', marginBottom: 8, textAlign: 'center' },
  apercuScroll: { maxHeight: 320 },
  apercuTexte: { fontFamily: 'monospace', fontSize: 11, color: '#1e293b' },
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
  titre: { fontSize: 22, fontWeight: '800', color: colors.primaryDarker, marginTop: 4 },
  onglets: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomColor: '#d5eee9',
    borderBottomWidth: 2,
    marginBottom: 12,
    borderRadius: 0,
  },
  onglet: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  ongletActif: { borderBottomColor: colors.primary },
  ongletTexte: { fontSize: 13, fontWeight: '700', color: '#5f857f' },
  ongletTexteActif: { color: colors.primaryDark },
  ongletCount: {
    backgroundColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  ongletCountActif: { backgroundColor: colors.primary },
  ongletCountTexte: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  ongletCountTexteActif: { color: '#fff' },
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
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
  },
  paginationTexte: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  modalVoile: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalVoileCentree: { justifyContent: 'center', padding: 20 },
  modalCarteCentree: { borderRadius: 18 },
  modalCarte: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '85%',
  },
  modalEntete: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  modalTitre: { fontSize: 17, fontWeight: '800', color: colors.primaryDarker },
  modalSousTitre: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  modalFermer: { padding: 6, marginLeft: 10 },
  modalFermerTexte: { fontSize: 16, fontWeight: '800', color: colors.textMuted },
  modalScroll: { flexGrow: 0 },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 14,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 12,
  },
})
