import { useTheme, THEMES } from '../context/ThemeContext.jsx'

/** Painel simples (não é modal — encaixa direto na tela que o chamar) pra escolher o tema. */
export default function ThemeSettings({ onClose }) {
  const { theme, setTheme } = useTheme()

  return (
    <div className="fixed inset-0 z-30 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">🎨 Personalizar tema</h2>
          <button onClick={onClose} className="text-white/40 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`rounded-2xl p-4 border text-left transition-colors ${
                theme === t.id ? 'border-[rgb(var(--accent-primary))] bg-white/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex gap-1.5 mb-3">
                <span className="w-6 h-6 rounded-full" style={{ background: t.swatch[0] }} />
                <span className="w-6 h-6 rounded-full" style={{ background: t.swatch[1] }} />
              </div>
              <p className="text-sm text-white font-medium">{t.label}</p>
              {theme === t.id && <p className="text-[10px] text-[rgb(var(--accent-primary))] mt-0.5">selecionado</p>}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-white/30 mt-5">
          Salvo só neste navegador — como não tem conta, cada dispositivo escolhe o seu.
        </p>
      </div>
    </div>
  )
}
