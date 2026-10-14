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
  multiple = false,
}: {
  label?: string
  value: string
  options: Option[]
  placeholder?: string
  onChange: (v: string) => void
  /** Appelé quand l'utilisateur saisit un nouveau libellé (auto-alimentation). */
  ajouter?: (libelle: string) => void
  keyboardType?: 'default' | 'numeric'
  /** Choix multiple : cases à cocher dans la liste, value = « A ; B ; C ». */
  multiple?: boolean
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

  // Choix multiple : valeurs cochées (les saisies libres restent proposées)
  const choisis = useMemo(
    () => (multiple ? (value ?? '').split(';').map((x) => x.trim()).filter(Boolean) : []),
    [multiple, value],
  )
  const toutes = useMemo(() => {
    if (!multiple) return options
    const libelles = options.map((o) => o.label)
    return [...options, ...choisis.filter((c) => !libelles.includes(c)).map((c) => ({ value: c, label: c }))]
  }, [multiple, options, choisis])
  const estChoisi = (libelle: string) => (multiple ? choisis.includes(libelle) : libelle === value)

  const filtrees = useMemo(() => {
    const q = norm(recherche.trim())
    if (!q) return toutes
    return toutes.filter((o) => norm(o.label).includes(q))
  }, [toutes, recherche])

  function ouvrir() {
    setRecherche('')
    setLibre('')
    setOuvert(true)
  }

  function choisir(libelle: string) {
    if (multiple) {
      // Coche / décoche sans fermer la liste
      onChange((choisis.includes(libelle) ? choisis.filter((c) => c !== libelle) : [...choisis, libelle]).join(' ; '))
      return
    }
    onChange(libelle)
    setOuvert(false)
  }

  function validerLibre() {
    const v = libre.trim()
    if (!v) return
    if (ajouter) ajouter(v)
    if (multiple) {
      setLibre('')
      if (!choisis.includes(v)) onChange([...choisis, v].join(' ; '))
      return
    }
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
        <Text style={styles.champTexte} numberOfLines={multiple ? 4 : 1} ellipsizeMode="tail">
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
                <Pressable
                  style={({ pressed }) => [
                    styles.option,
                    multiple && styles.optionMultiple,
                    estChoisi(item.label) && styles.optionChoisie,
                    pressed && styles.optionPressee,
                  ]}
                  onPress={() => choisir(item.label)}
                >
                  {multiple ? (
                    <View style={[styles.caseCocher, estChoisi(item.label) && styles.caseCochee]}>
                      {estChoisi(item.label) ? <Text style={styles.caseCoche}>✓</Text> : null}
                    </View>
                  ) : null}
                  <Text style={[styles.optionTexte, multiple && { flex: 1 }, estChoisi(item.label) && styles.optionTexteChoisi]} numberOfLines={2}>
                    {!multiple && estChoisi(item.label) ? '✓  ' : ''}
                    {item.label}
                  </Text>
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
            {multiple ? (
              <Pressable style={styles.termineBtn} onPress={() => setOuvert(false)}>
                <Text style={styles.libreBtnTexte}>
                  Terminé{choisis.length ? ` (${choisis.length} coché${choisis.length > 1 ? 's' : ''})` : ''}
                </Text>
              </Pressable>
            ) : null}
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
    borderWidth: 1.5,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: colors.surface,
    minHeight: 46,
  },
  vide: { borderStyle: 'dashed' },
  champTexte: { flex: 1, fontSize: 14.5, color: colors.text },
  fleche: { fontSize: 15, color: colors.primary, fontWeight: '800' },
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
  liste: { maxHeight: 400, flexShrink: 1 },
  option: {
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  optionTexte: { fontSize: 15, color: colors.text },
  optionChoisie: { backgroundColor: '#e6f4f1' },
  optionPressee: { backgroundColor: '#d5eee9' },
  optionTexteChoisi: { fontWeight: '800', color: colors.primaryDarker },
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
  optionMultiple: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  caseCocher: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.borderChamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseCochee: { backgroundColor: colors.primary, borderColor: colors.primary },
  caseCoche: { color: '#fff', fontWeight: '800', fontSize: 14 },
  termineBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: 'center',
  },
})
