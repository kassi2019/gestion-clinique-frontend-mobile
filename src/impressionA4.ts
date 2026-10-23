import * as Print from 'expo-print'
import { Alert } from 'react-native'

/**
 * Impression A4 depuis le téléphone (équivalent du window.print() du web) :
 * ouvre l'écran d'impression Android/iOS (imprimante Wi-Fi ou « Enregistrer en PDF »).
 * `corps` est du HTML ; les styles ci-dessous reprennent ceux des feuilles A4 du web.
 */
export async function imprimerA4(corps: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  h2 { font-size: 14px; text-align: center; margin: 4px 0 10px; }
  h3 { font-size: 12px; margin: 12px 0 4px; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #555; padding: 4px 5px; text-align: left; vertical-align: top; }
  th { background: #e5e7eb; }
  td.num, th.num { text-align: right; }
  .infos td:first-child { width: 35%; font-weight: bold; }
  .total td { font-weight: bold; font-size: 12px; }
  .centre { text-align: center; }
  .sign { display: flex; justify-content: space-between; margin-top: 40px; }
  .sign div { width: 45%; text-align: center; min-height: 70px; border-top: 1px solid #555; padding-top: 4px; }
  .pied { margin-top: 18px; font-size: 9px; color: #555; }
</style></head><body>${corps}</body></html>`
  try {
    await Print.printAsync({ html })
  } catch (e: any) {
    // L'utilisateur qui ferme l'écran d'impression n'est pas une erreur
    if (!String(e?.message ?? '').toLowerCase().includes('cancel')) {
      Alert.alert('Impression', e?.message ?? 'Impression impossible.')
    }
  }
}

/** Échappe le texte inséré dans le HTML imprimé. */
export function h(x: unknown) {
  return String(x ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
