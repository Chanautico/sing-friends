import { useCallback, useRef, useState } from 'react'

const BAR_COUNT = 24

// Algoritmo de autocorrelação otimizado para extrair a frequência fundamental (Pitch em Hz)
function autoCorrelate(buffer, sampleRate) {
  let SIZE = buffer.length
  let sumOfSquares = 0
  for (let i = 0; i < SIZE; i++) {
    let val = buffer[i]
    sumOfSquares += val * val
  }
  let rootMeanSquare = Math.sqrt(sumOfSquares / SIZE)
  if (rootMeanSquare < 0.01) return -1 // Silêncio ou som muito baixo

  let r1 = 0, r2 = SIZE - 1, threshold = 0.2
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < threshold) { r2 = SIZE - i; break; }
  }

  buffer = buffer.slice(r1, r2)
  SIZE = buffer.length

  let c = new Array(SIZE).fill(0)
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE - i; j++) {
      c[i] = c[i] + buffer[j] * buffer[j + i]
    }
  }

  let d = 0
  while (c[d] > c[d + 1]) d++
  let maxval = -1, maxpos = -1
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i]
      maxpos = i
    }
  }
  let T0 = maxpos
  return sampleRate / T0
}

// Conversor de frequência (Hz) para nome da nota musical (Ex: "C4", "A4")
function frequencyToNoteName(frequency) {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const A4 = 440
  let c0 = A4 * Math.pow(2, -4.75)
  let halfSteps = Math.round(12 * Math.log2(frequency / c0))
  let noteIndex = halfSteps % 12
  let octave = Math.floor(halfSteps / 12)
  return `${noteNames[noteIndex]}${octave}`
}

export function useMicLevel() {
  const [isActive, setIsActive] = useState(false)
  const [volume, setVolume] = useState(0)
  const [pitch, setPitch] = useState(0)       // Frequência exata em Hz
  const [note, setNote] = useState(null)     // Nota musical atual (ex: "G4")
  const [bars, setBars] = useState(() => new Array(BAR_COUNT).fill(0))
  const [error, setError] = useState(null)

  const audioCtxRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const smoothedRef = useRef(0)

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current = null
    smoothedRef.current = 0
    setIsActive(false)
    setVolume(0)
    setPitch(0)
    setNote(null)
    setBars(new Array(BAR_COUNT).fill(0))
    console.log("🎤 Microfone parado.")
  }, [])

  const start = useCallback(async () => {
    setError(null)
    console.log("🎤 1. Solicitando acesso ao microfone ao navegador...")
    
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("O navegador bloqueou o acesso. Você está usando localhost?")
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      console.log("🎤 2. Acesso concedido! Capturando stream...")

      const AudioContextImpl = window.AudioContext || window.webkitAudioContext
      const audioCtx = new AudioContextImpl()

      if (audioCtx.state === 'suspended') {
        console.log("🎤 3. AudioContext estava suspenso. Tentando forçar o desbloqueio...")
        await audioCtx.resume()
      }
      
      console.log("🎤 4. Sistema de áudio ativo! Status:", audioCtx.state)

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048 // Aumentado para dar mais precisão matemática ao pitch
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)

      audioCtxRef.current = audioCtx
      streamRef.current = stream
      setIsActive(true)

      const freqData = new Uint8Array(analyser.frequencyBinCount)
      const timeData = new Float32Array(analyser.fftSize)
      const barStep = Math.max(1, Math.floor(freqData.length / BAR_COUNT))

      const loop = () => {
        analyser.getByteFrequencyData(freqData)
        analyser.getFloatTimeDomainData(timeData)

        // 1. Cálculo de Volume (RMS)
        let sumSquares = 0
        for (let i = 0; i < timeData.length; i++) sumSquares += timeData[i] * timeData[i]
        const rms = Math.sqrt(sumSquares / timeData.length)

        smoothedRef.current = smoothedRef.current * 0.7 + rms * 0.3
        setVolume(Math.min(1, smoothedRef.current * 12)) 

        // 2. Detecção de Tom / Frequência Real (Pitch)
        const detectedFreq = autoCorrelate(timeData, audioCtx.sampleRate)
        if (detectedFreq !== -1 && detectedFreq > 60 && detectedFreq > 0) {
          setPitch(Math.round(detectedFreq))
          setNote(frequencyToNoteName(detectedFreq))
        } else {
          setNote(null) // Se estiver silencioso ou fora do alcance vocal humano base
        }

        // 3. Barras visuais do espectro
        setBars(Array.from({ length: BAR_COUNT }, (_, i) => freqData[i * barStep] / 255))

        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    } catch (err) {
      console.error("🎤 ERRO FATAL DO MICROFONE:", err)
      setError(
        err.name === 'NotAllowedError'
          ? 'Permissão de microfone negada — habilite nas configurações do navegador e clique de novo.'
          : `Erro ao acessar o microfone: ${err.message}`
      )
    }
  }, [])

  return { start, stop, isActive, volume, pitch, note, bars, error }
}