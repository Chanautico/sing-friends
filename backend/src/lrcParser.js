// Formato LRC: cada linha é `[mm:ss.xx]texto da linha`, ex: `[00:12.50]Hello, is it me`
// Retorna um array ordenado [{ time: segundos, text: string }] pronto para o player usar.
const LINE_REGEX = /\[(\d{2}):(\d{2})(?:\.(\d{1,2}))?\]\s*(.*)/

export function parseLRC(lrcText) {
  const lines = lrcText.split(/\r?\n/)
  const parsed = []

  for (const line of lines) {
    const match = line.match(LINE_REGEX)
    if (!match) continue
    const [, mm, ss, centis, text] = match
    const time = Number(mm) * 60 + Number(ss) + (centis ? Number(centis) / 100 : 0)
    if (text.trim()) parsed.push({ time, text: text.trim() })
  }

  return parsed.sort((a, b) => a.time - b.time)
}
