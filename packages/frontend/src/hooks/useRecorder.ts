/**
 * Audio recording hook using Web Audio API
 * Handles microphone access and MediaRecorder
 */

import { useState, useRef, useCallback } from 'react'

export interface RecorderState {
  isRecording: boolean
  isSupported: boolean
  duration: number
  error: string | null
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
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)

  const startRecording = useCallback(async () => {
    try {
      // Reset state
      setState((prev) => ({ ...prev, error: null }))
      chunksRef.current = []

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

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

      // Track duration
      setState((prev) => ({
        ...prev,
        isRecording: true,
        duration: 0,
      }))

      durationIntervalRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }))
      }, 100)
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

        mediaRecorder.onstop = () => {
          // Stop all audio tracks
          mediaRecorder.stream.getTracks().forEach((track) => track.stop())

          // Create blob from chunks
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
          chunksRef.current = []

          setState((prev) => ({
            ...prev,
            isRecording: false,
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

    chunksRef.current = []

    setState((prev) => ({
      ...prev,
      isRecording: false,
      duration: 0,
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

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  }
}
