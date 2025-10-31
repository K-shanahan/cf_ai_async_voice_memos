/**
 * Audio recording hook using Web Audio API
 * Handles microphone access and MediaRecorder
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { createAudioAnalyzer, AudioAnalyzer } from '../utils/audioAnalyzer'

export interface RecorderState {
  isRecording: boolean
  isSupported: boolean
  duration: number
  error: string | null
  volume: number
}

export interface UseRecorderReturn extends RecorderState {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  cancelRecording: () => void
  reset: () => void
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    duration: 0,
    error: null,
    volume: 0,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const volumeAnimationRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const analyzerRef = useRef<AudioAnalyzer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const startRecording = useCallback(async () => {
    try {
      // Reset state
      setState((prev) => ({ ...prev, error: null, volume: 0 }))
      chunksRef.current = []

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      // Create audio analyzer for volume detection
      const { analyzer, audioContext } = createAudioAnalyzer(stream)
      analyzerRef.current = analyzer
      audioContextRef.current = audioContext

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      })

      mediaRecorderRef.current = mediaRecorder
      startTimeRef.current = Date.now()

      // Track audio chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onerror = (event) => {
        setState((prev) => ({
          ...prev,
          error: `Recording error: ${event.error}`,
          isRecording: false,
        }))
      }

      mediaRecorder.start()

      // Track duration and volume
      setState((prev) => ({
        ...prev,
        isRecording: true,
        duration: 0,
        volume: 0,
      }))

      durationIntervalRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }))
      }, 100)

      // Track volume with animation frame for smooth updates
      const updateVolume = () => {
        if (analyzerRef.current) {
          const volume = analyzerRef.current.getVolume()
          setState((prev) => ({
            ...prev,
            volume,
          }))
        }
        volumeAnimationRef.current = requestAnimationFrame(updateVolume)
      }
      volumeAnimationRef.current = requestAnimationFrame(updateVolume)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access microphone'
      setState((prev) => ({
        ...prev,
        error: message,
        isSupported: false,
      }))
    }
  }, [])

  const stopRecording = useCallback(
    async (): Promise<Blob | null> => {
      return new Promise((resolve) => {
        if (!mediaRecorderRef.current) {
          setState((prev) => ({
            ...prev,
            error: 'No recording in progress',
          }))
          resolve(null)
          return
        }

        const mediaRecorder = mediaRecorderRef.current

        // Clear duration interval
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current)
          durationIntervalRef.current = null
        }

        // Clear volume animation
        if (volumeAnimationRef.current) {
          cancelAnimationFrame(volumeAnimationRef.current)
          volumeAnimationRef.current = null
        }

        mediaRecorder.onstop = () => {
          // Stop all audio tracks
          mediaRecorder.stream.getTracks().forEach((track) => track.stop())

          // Clean up audio context
          if (audioContextRef.current) {
            audioContextRef.current.close()
            audioContextRef.current = null
          }
          analyzerRef.current = null

          // Create blob from chunks
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
          chunksRef.current = []

          setState((prev) => ({
            ...prev,
            isRecording: false,
            volume: 0,
          }))

          resolve(audioBlob)
        }

        mediaRecorder.stop()
      })
    },
    []
  )

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    if (volumeAnimationRef.current) {
      cancelAnimationFrame(volumeAnimationRef.current)
      volumeAnimationRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyzerRef.current = null

    chunksRef.current = []

    setState((prev) => ({
      ...prev,
      isRecording: false,
      duration: 0,
      volume: 0,
    }))
  }, [state.isRecording])

  const reset = useCallback(() => {
    cancelRecording()
    setState((prev) => ({
      ...prev,
      error: null,
      duration: 0,
    }))
  }, [cancelRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      if (volumeAnimationRef.current) {
        cancelAnimationFrame(volumeAnimationRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  }
}
