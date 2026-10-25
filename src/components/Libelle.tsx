import React from 'react'
import { StyleSheet, Text, TextStyle } from 'react-native'
import { colors } from '../theme'

/**
 * Libellé de champ : l'astérisque des champs obligatoires (« Nom * »,
 * « Code * (auto) » ou prop `required`) est affiché en rouge, un peu plus grand.
 */
export default function Libelle({
  label,
  required,
  style,
}: {
  label: string
  required?: boolean
  style?: TextStyle | TextStyle[]
}) {
  const [avant, ...apres] = label.split(/\s*\*(?=\s|$)/)
  const etoile = required || apres.length > 0
  return (
    <Text style={style}>
      {avant}
      {etoile ? <Text style={styles.requis}> *</Text> : null}
      {apres.join(' *')}
    </Text>
  )
}

const styles = StyleSheet.create({
  requis: { color: colors.danger, fontSize: 16, fontWeight: '800' },
})
