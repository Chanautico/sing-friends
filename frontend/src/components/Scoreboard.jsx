export default function Scoreboard({ users, onClose }) {
  const sorted = [...users].sort((a, b) => b.score - a.score)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center px-6 z-20">
      <h2 className="text-4xl font-bold bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] bg-clip-text text-transparent mb-6">
        Placar
      </h2>
      <ul className="w-full max-w-sm space-y-2 mb-8">
        {sorted.map((u, i) => (
          <li
            key={u.id}
            className="flex items-center justify-between rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-3"
          >
            <span className="flex items-center gap-3 text-white">
              <span className="w-6 text-center">{medals[i] ?? `${i + 1}º`}</span>
              {u.name}
            </span>
            <span className="font-bold text-lg text-[rgb(var(--accent-secondary))] tabular-nums">{u.score}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onClose}
        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white font-semibold shadow-[0_0_30px_rgb(var(--accent-primary)/0.4)] transition-transform active:scale-95"
      >
        Voltar à sala
      </button>
    </div>
  )
}
