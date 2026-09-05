import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { API_URL } from '../lib/api.js'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const socketRef = useRef(null)
  const [room, setRoom] = useState(null)
  const [userId, setUserId] = useState(() => localStorage.getItem('karaoke_user_id') || null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    // Sem URL fixa: em dev, o proxy do vite.config.js encaminha `/socket.io` pro backend
    // (porta 3002); em produção, `/` resolve pro mesmo domínio que serve o frontend, então
    // não há nada de "localhost" hardcoded pra trocar na hora do deploy.
    // Vazio (dev) conecta same-origin, aproveitando o proxy do vite.config.js. Preenchido
    // (produção, via VITE_API_URL) conecta direto na URL pública do backend — necessário
    // porque frontend e backend normalmente ficam em domínios diferentes em produção.
    // Sem sistema de login: não há token nenhum pra mandar — todo mundo é convidado.
    const socket = io(API_URL || undefined)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)

      // Tenta reconectar automaticamente se houver dados salvos no localStorage
      const savedCode = localStorage.getItem('karaoke_room_code')
      const savedUserId = localStorage.getItem('karaoke_user_id')

      if (savedCode && savedUserId) {
        socket.emit('room:join', { code: savedCode, name: localStorage.getItem('karaoke_user_name') || 'Convidado' }, (result) => {
          if (!result.error) {
            setRoom(result.room)
            setUserId(result.userId)
          } else {
            localStorage.removeItem('karaoke_room_code')
          }
        })
      }
    })

    socket.on('disconnect', () => setConnected(false))
    socket.on('room:update', (updatedRoom) => setRoom(updatedRoom))

    return () => socket.disconnect()
  }, [])

  const createRoom = useCallback(
    (hostName, isPublic = false) =>
      new Promise((resolve) => {
        socketRef.current.emit('room:create', { hostName, isPublic }, ({ room, userId }) => {
          setRoom(room)
          setUserId(userId)

          localStorage.setItem('karaoke_user_id', userId)
          localStorage.setItem('karaoke_user_name', hostName)
          localStorage.setItem('karaoke_room_code', room.code)

          resolve({ room, userId })
        })
      }),
    []
  )

  const joinRoom = useCallback(
    (code, name) =>
      new Promise((resolve) => {
        socketRef.current.emit('room:join', { code, name }, (result) => {
          if (!result.error) {
            setRoom(result.room)
            setUserId(result.userId)

            localStorage.setItem('karaoke_user_id', result.userId)
            localStorage.setItem('karaoke_user_name', name)
            localStorage.setItem('karaoke_room_code', result.room.code)
          }
          resolve(result)
        })
      }),
    []
  )

  const addToQueue = useCallback(
    (song) => socketRef.current.emit('queue:add', { code: room?.code, song, addedBy: userId }),
    [room, userId]
  )

  const removeFromQueue = useCallback(
    (songId) => {
      if (!room) return
      socketRef.current.emit('queue:remove', { code: room.code, songId })
    },
    [room]
  )

  const nextSong = useCallback(
    (singerId, mode = 'solo', singerIds) =>
      socketRef.current.emit('song:next', { code: room?.code, singerId, mode, singerIds }),
    [room]
  )

  const endSong = useCallback(() => socketRef.current.emit('song:end', { code: room?.code }), [room])

  const leaveRoom = useCallback(
    () =>
      new Promise((resolve) => {
        socketRef.current.emit('room:leave', { code: room?.code }, () => {
          localStorage.removeItem('karaoke_room_code')
          localStorage.removeItem('karaoke_user_id')
          setRoom(null)
          setUserId(null)
          resolve()
        })
      }),
    [room]
  )

  const reportScoreDelta = useCallback(
    (delta) => socketRef.current.emit('score:update', { code: room?.code, userId, delta }),
    [room, userId]
  )

  const onSongStart = useCallback((handler) => {
    socketRef.current.on('song:start', handler)
    return () => socketRef.current.off('song:start', handler)
  }, [])

  const onSongEnded = useCallback((handler) => {
    socketRef.current.on('song:ended', handler)
    return () => socketRef.current.off('song:ended', handler)
  }, [])

  const sendChatMessage = useCallback(
    (text) =>
      new Promise((resolve) => {
        socketRef.current.emit('chat:message', { code: room?.code, text }, (result) => resolve(result))
      }),
    [room]
  )

  const onChatMessage = useCallback((handler) => {
    socketRef.current.on('chat:message', handler)
    return () => socketRef.current.off('chat:message', handler)
  }, [])

  return (
    <SocketContext.Provider
      value={{
        room,
        userId,
        connected,
        createRoom,
        joinRoom,
        addToQueue,
        removeFromQueue,
        nextSong,
        endSong,
        leaveRoom,
        reportScoreDelta,
        onSongStart,
        onSongEnded,
        sendChatMessage,
        onChatMessage,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useKaraokeSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useKaraokeSocket precisa ser usado dentro de <SocketProvider>')
  return ctx
}
