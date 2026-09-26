import React, { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { colors, radius } from '../theme'

/**
 * Champ date avec calendrier (composant natif inclus dans Expo Go).
 * La valeur est une chaîne AAAA-MM-JJ, comme les autres dates de l'application.
 */
export default function DateField({
  label,
  value,
  onChange,
  placeholder = '— Choisir une date —',
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const date = value ? new Date(value) : new Date()

  function afficher() {
    setOuvert(true)
  }

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.champ} onPress={afficher} accessibilityRole="button">
        <Text style={[styles.texte, !value && styles.vide]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={styles.fleche}>📅</Text>
      </Pressable>
      {ouvert ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(event, d) => {
            // Android : le sélecteur se ferme après le premier événement
            if (Platform.OS === 'android') setOuvert(false)
            if (event.type === 'set' && d) {
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
                d.getDate(),
              ).padStart(2, '0')}`
              onChange(iso)
            }
            if (event.type === 'dismissed') setOuvert(false)
          }}
        />
      ) : null}
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
  texte: { flex: 1, fontSize: 14.5, color: colors.text },
  vide: { color: '#94a3b8' },
  fleche: { fontSize: 14 },
})
