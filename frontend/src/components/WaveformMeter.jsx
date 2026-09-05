/**
 * Barra de onda sonora reagindo ao microfone. `active` = mic ligado; `volume` decide a cor
 * (acima do threshold = brilho neon, indicando "está sendo ouvido"); `bars` vem do hook
 * useMicLevel (amostra do espectro de frequência, já em 0–1 por barra).
 */
export default function WaveformMeter({ bars, volume, active, threshold = 0.12 }) {
  const singing = active && volume > threshold

  return (
    <div className="relative flex items-end justify-center gap-1 h-16 w-full max-w-xs mx-auto">
      {!active && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
          microfone inativo
        </p>
      )}
      {bars.map((v, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-full transition-all duration-75 ${
            singing
              ? 'bg-gradient-to-t from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] shadow-[0_0_8px_rgb(var(--accent-primary)/0.7)]'
              : 'bg-white/15'
          }`}
          style={{ height: `${active ? Math.max(6, v * 100) : 4}%` }}
        />
      ))}
    </div>
  )
}
