import { Router } from 'express'
import { parseLRC } from './lrcParser.js'

const router = Router()
const LRCLIB_BASE = 'https://lrclib.net/api'

/**
 * GET /api/lyrics?title=...&artist=...&duration=...
 *
 * Busca a letra sincronizada na LRCLIB (API pública gratuita, sem chave de API) e devolve
 * já convertida em [{ time: segundos, text: string }], pronta pro KaraokePlayer usar.
 *
 * `duration` (em segundos, opcional) ajuda a LRCLIB a bater com a versão certa da música
 * quando há várias gravações com o mesmo título — vale passar a duração do vídeo do
 * YouTube aqui se o frontend tiver esse dado (react-player expõe via `getDuration()`).
 */
router.get('/', async (req, res) => {
  const { title, artist, duration } = req.query

  if (!title?.trim()) {
    return res.status(400).json({ error: 'Informe ao menos o parâmetro "title".' })
  }

  try {
    const params = new URLSearchParams({ track_name: title.trim() })
    if (artist?.trim()) params.set('artist_name', artist.trim())

    const searchRes = await fetch(`${LRCLIB_BASE}/search?${params.toString()}`)
    if (!searchRes.ok) throw new Error(`LRCLIB respondeu ${searchRes.status}`)
    const results = await searchRes.json()

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(404).json({ error: 'Nenhuma letra encontrada para essa música na LRCLIB.' })
    }

    // Prioriza resultados com letra sincronizada; entre eles, o mais próximo da duração informada.
    const withSync = results.filter((r) => r.syncedLyrics)
    const candidates = withSync.length > 0 ? withSync : results

    let best = candidates[0]
    if (duration) {
      const targetDuration = Number(duration)
      best = candidates.reduce((closest, r) =>
        Math.abs(r.duration - targetDuration) < Math.abs(closest.duration - targetDuration) ? r : closest
      , candidates[0])
    }

    const hasSyncedLyrics = Boolean(best.syncedLyrics)
    const lyrics = hasSyncedLyrics ? parseLRC(best.syncedLyrics) : []

    res.json({
      title: best.trackName,
      artist: best.artistName,
      duration: best.duration,
      lyrics, // [] quando só existe letra "plana" (sem timestamps) ou nenhuma letra
      plainLyrics: hasSyncedLyrics ? null : best.plainLyrics ?? null,
      hasSyncedLyrics,
    })
  } catch (err) {
    console.error('[GET /api/lyrics]', err)
    res.status(502).json({ error: 'Falha ao buscar a letra na LRCLIB.', detail: err.message })
  }
})

export default router
