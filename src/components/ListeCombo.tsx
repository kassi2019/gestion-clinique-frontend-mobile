import React, { useMemo, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors, radius } from '../theme'

export type Option = { value: number | string; label: string }

/**
 * Liste déroulante avec recherche ET saisie libre (équivalent du « datalist »
 * du web) : on choisit une valeur de la liste, ou on tape un nouveau libellé
 * qui sera ajouté automatiquement à la liste par le backend.
 */
export default function ListeCombo({
  label,
  value,
  options,
  placeholder = '— Choisir —',
  onChange,
  ajouter,
  keyboardType,
}: {
  label?: string
  value: string
  options: Option[]
  placeholder?: string
  onChange: (v: string) => void
  /** Appelé quand l'utilisateur saisit un nouveau libellé (auto-alimentation). */
  ajouter?: (libelle: string) => void
  keyboardType?: 'default' | 'numeric'
}) {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [libre, setLibre] = useState('')

  // Normalisation : recherche réellement insensible aux accents et à la casse.
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()

  const filtrees = useMemo(() => {
    const q = norm(recherche.trim())
    if (!q) return options
    return options.filter((o) => norm(o.label).includes(q))
  }, [options, recherche])

  function ouvrir() {
    setRecherche('')
    setLibre('')
    setOuvert(true)
  }

  function choisir(libelle: string) {
    onChange(libelle)
    setOuvert(false)
  }

  function validerLibre() {
    const v = libre.trim()
    if (!v) return
    if (ajouter) ajouter(v)
    choisir(v)
  }

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.champ, !value && styles.vide]}
        onPress={ouvrir}
        accessibilityRole="button"
      >
        <Text style={styles.champTexte} numberOfLines={1} ellipsizeMode="tail">
          {value || placeholder}
        </Text>
        <Text style={styles.fleche}>▾</Text>
      </Pressable>

      <Modal visible={ouvert} transparent animationType="slide" onRequestClose={() => setOuvert(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.voile} onPress={() => setOuvert(false)}>
            <Pressable style={styles.carte} onPress={() => {}}>
            <Text style={styles.titre}>{label ?? 'Choisir'}</Text>
            <TextInput
              style={styles.recherche}
              placeholder="Rechercher…"
              placeholderTextColor="#94a3b8"
              value={recherche}
              onChangeText={setRecherche}
              autoCapitalize="characters"
            />
            <FlatList
              data={filtrees}
              keyExtractor={(o) => String(o.value)}
              style={styles.liste}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.option} onPress={() => choisir(item.label)}>
                  <Text style={styles.optionTexte} numberOfLines={2}>{item.label}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.videTexte}>Aucune valeur — saisissez un nouveau libellé ci-dessous.</Text>
              }
            />
            <View style={styles.libreBloc}>
              <Text style={styles.libreTitre}>✏️ Nouveau libellé</Text>
              <View style={styles.libreLigne}>
                <TextInput
                  style={styles.libreChamp}
                  placeholder="Saisir une nouvelle valeur…"
                  placeholderTextColor="#94a3b8"
                  value={libre}
                  onChangeText={setLibre}
                  autoCapitalize="characters"
                  keyboardType={keyboardType}
                />
                <Pressable style={styles.libreBtn} onPress={validerLibre}>
                  <Text style={styles.libreBtnTexte}>OK</Text>
                </Pressable>
              </View>
            </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  champ: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: colors.surface,
    minHeight: 46,
  },
  vide: { borderStyle: 'dashed' },
  champTexte: { flex: 1, fontSize: 14.5, color: colors.text },
  fleche: { fontSize: 13, color: colors.textMuted },
  voile: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  carte: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 26,
    maxHeight: '85%',
  },
  titre: { fontSize: 16, fontWeight: '800', color: colors.primaryDarker, marginBottom: 10 },
  recherche: {
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  liste: { maxHeight: 260 },
  option: {
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  optionTexte: { fontSize: 14.5, color: colors.text },
  videTexte: { color: colors.textMuted, paddingVertical: 12, fontStyle: 'italic' },
  libreBloc: {
    marginTop: 10,
    paddingTop: 10,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  libreTitre: { fontSize: 12.5, fontWeight: '800', color: colors.primaryDark, marginBottom: 6 },
  libreLigne: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  libreChamp: {
    flex: 1,
    borderColor: colors.borderChamp,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    backgroundColor: colors.surface,
  },
  libreBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  libreBtnTexte: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
