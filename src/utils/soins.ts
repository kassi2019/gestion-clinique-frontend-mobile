// Soins prescrits par le médecin (onglet « Soins » de la consultation → module Soins)

/** Voies d'administration (valeurs attendues par le backend). */
export const VOIES_SOIN = [
  { value: 'IM', label: 'IM — intramusculaire' },
  { value: 'IV', label: 'IV — intraveineuse' },
  { value: 'SC', label: 'SC — sous-cutanée' },
  { value: 'ID', label: 'ID — intradermique' },
  { value: 'PO', label: 'Voie orale' },
  { value: 'LOCALE', label: 'Application locale' },
  { value: 'AUTRE', label: 'Autre voie' },
]

/** Unités proposées pour la quantité par administration (saisie libre possible). */
export const UNITES_SOIN = ['AMPOULE', 'FLACON', 'POCHE', 'ML', 'COMPRIMÉ', 'SACHET', 'APPLICATION'].map((u) => ({
  value: u,
  label: u,
}))

export function libelleVoie(v?: string | null) {
  return VOIES_SOIN.find((x) => x.value === v)?.label ?? v ?? ''
}

export function libelleStatutSoin(s: string) {
  return ({ EN_COURS: 'En cours', TERMINE: 'Terminé', ARRETE: 'Arrêté' } as Record<string, string>)[s] ?? s
}

export function toneStatutSoin(s: string): 'success' | 'warning' | 'muted' {
  return s === 'TERMINE' ? 'success' : s === 'EN_COURS' ? 'warning' : 'muted'
}

/** « 1 », « 1/2 », « 0,5 », « ½ » → nombre (NaN si illisible). */
export function lireDose(dose?: string) {
  const t = String(dose ?? '').trim().replace(',', '.').replace('½', '1/2').replace('¼', '1/4')
  const fraction = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  const nombre = t.match(/^\d+(?:\.\d+)?/)
  return nombre ? Number(nombre[0]) : NaN
}

/** Unités à retirer à la pharmacie pour tout le traitement (arrondi au-dessus). */
export function quantiteSuggeree(dose: string, nbAdministrations: number) {
  const d = lireDose(dose)
  if (!d || !nbAdministrations) return 1
  return Math.max(1, Math.ceil(d * nbAdministrations))
}

/** Une ligne lisible : « DICLOFÉNAC — 1 AMPOULE (IM — intramusculaire) ». */
export function texteLigneSoin(l: any) {
  const dose = [l.dose, l.unite].filter(Boolean).join(' ')
  return `${l.medicamentNom} — ${dose}${l.voie ? ` (${libelleVoie(l.voie)})` : ''}${l.posologie ? ` · ${l.posologie}` : ''}`
}
