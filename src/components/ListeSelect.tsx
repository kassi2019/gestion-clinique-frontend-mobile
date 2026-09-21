import React, { useMemo, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors, radius } from '../theme'

export type Option = { value: number | string; label: string }

/**
 * Sélecteur avec recherche (équivalent du SelectSearch web).
 * Ouvre une liste filtrable, insensible aux accents.
 */
export default function ListeSelect({
  value,
  options,
  placeholder = '— Choisir —',
  onChange,
  disabled,
}: {
  value: number | string | null
  options: Option[]
  placeholder?: string
  onChange: (v: number | string | null) => void
  disabled?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, recherche])

  const choisie = options.find((o) => o.value === value)

  return (
    <View>
      <Pressable
        style={[styles.champ, disabled && styles.disabled]}
        onPress={() => {
          setRecherche('')
          setOuvert(true)
        }}
        disabled={disabled}
      >
        <Text style={choisie ? styles.valeur : styles.placeholder}>
          {choisie ? choisie.label : placeholder}
        </Text>
        <Text style={styles.fleche}>▾</Text>
      </Pressable>

      <Modal visible={ouvert} transparent animationType="slide" onRequestClose={() => setOuvert(false)}>
        <View style={styles.voile}>
          <View style={styles.fenetre}>
            <TextInput
              style={styles.recherche}
              placeholder="Rechercher…"
              value={recherche}
              onChangeText={setRecherche}
              autoFocus
            />
            <FlatList
              data={filtrees}
              keyExtractor={(o) => String(o.value)}
              style={styles.liste}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.item}
                  onPress={() => {
                    onChange(item.value)
                    setOuvert(false)
                  }}
                >
                  <Text style={styles.itemTexte}>{item.label}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.vide}>Aucun résultat</Text>}
            />
            <Pressable style={styles.fermer} onPress={() => setOuvert(false)}>
              <Text style={styles.fermerTexte}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  champ: {
    backgroundColor: colors.surface,
    borderColor: colors.borderChamp,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  disabled: { opacity: 0.5 },
  valeur: { fontSize: 15, color: colors.text },
  placeholder: { fontSize: 15, color: '#94a3b8' },
  fleche: { fontSize: 14, color: colors.textMuted },
  voile: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  fenetre: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '75%',
  },
  recherche: {
    borderColor: colors.borderChamp,
    borderWidth: 1.5,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    marginBottom: 8,
  },
  liste: { flexGrow: 0 },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  itemTexte: { fontSize: 15, color: colors.text },
  vide: { textAlign: 'center', color: colors.textMuted, paddingVertical: 16 },
  fermer: {
    marginTop: 10,
    backgroundColor: colors.primary,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: 'center',
  },
  fermerTexte: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
