import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius } from '../theme'

/** Champ de saisie avec libellé (ou conteneur pour un sélecteur personnalisé). */
export function Input({
  label,
  required,
  children,
  ...props
}: TextInputProps & { label?: string; required?: boolean; children?: React.ReactNode }) {
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
})
