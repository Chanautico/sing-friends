import { useEffect, useRef, useState } from 'react'
import { useKaraokeSocket } from '../context/SocketContext.jsx'

export default function Chat({ initialMessages = [] }) {
  const { userId, sendChatMessage, onChatMessage } = useKaraokeSocket()
  const [messages, setMessages] = useState(initialMessages)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  // Recebe mensagens novas de qualquer pessoa da sala em tempo real. O histórico inicial
  // (últimas ~50) já vem junto do payload da sala ao entrar — ver `initialMessages`.
  useEffect(() => onChatMessage((message) => setMessages((prev) => [...prev, message])), [onChatMessage])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setError(null)

    const result = await sendChatMessage(text)
    if (result?.error) {
      setError(result.error) // ex: "linguagem inadequada", "mensagens rápido demais"
      return
    }
    setText('')
  }

  return (
    <section className="rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 mt-4 flex flex-col h-80">
      <h2 className="text-sm font-semibold text-white/70 mb-2">💬 Chat da sala</h2>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {messages.length === 0 ? (
          <p className="text-xs text-white/30">Ninguém disse nada ainda — comece a conversa.</p>
        ) : (
          messages.map((m) => (
            <p key={m.id} className="text-sm text-white/80 break-words">
              <span className={`font-semibold ${m.userId === userId ? 'text-[rgb(var(--accent-primary))]' : 'text-[rgb(var(--accent-secondary))]'}`}>
                {m.name}:
              </span>{' '}
              {m.text}
            </p>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mandar mensagem..."
          maxLength={300}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary))]"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white text-sm font-semibold disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </section>
  )
}
