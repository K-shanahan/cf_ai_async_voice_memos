/**
 * Hook for local audio playback from Blob
 * Used for preview playback of recorded audio before upload
 */

import { useState, useRef, useCallback, useEffect } from 'react'

export interface PlaybackState {
  isPlaying: boolean
  currentTime: number
  duration: number
  error: string | null
}

export interface UseLocalAudioPlaybackReturn extends PlaybackState {
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  reset: () => void
}

export function useLocalAudioPlayback(blob: Blob | null): UseLocalAudioPlaybackReturn {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    error: null,
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // Initialize audio element and blob URL
  useEffect(() => {
    if (!blob) {
      return
    }

    // Create blob URL
    const url = URL.createObjectURL(blob)
    blobUrlRef.current = url

    // Create audio element if not exists
    if (!audioRef.current) {
      const audio = new Audio()
      audioRef.current = audio

      // Track duration when metadata is loaded
      audio.addEventListener('loadedmetadata', () => {
        setState((prev) => ({
          ...prev,
          duration: audio.duration,
        }))
      })

      // Update current time as audio plays
      audio.addEventListener('timeupdate', () => {
        setState((prev) => ({
          ...prev,
          currentTime: audio.currentTime,
        }))
      })

      // Handle playback ended
      audio.addEventListener('ended', () => {
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          currentTime: audio.duration,
        }))
      })

      // Handle errors
      audio.addEventListener('error', () => {
        setState((prev) => ({
          ...prev,
          error: 'Failed to load audio',
          isPlaying: false,
        }))
      })
    }

    audioRef.current.src = url

    // Cleanup on unmount
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [blob])

  const play = useCallback(async () => {
    if (!audioRef.current) {
      setState((prev) => ({
        ...prev,
        error: 'Audio not loaded',
      }))
      return
    }

    try {
      setState((prev) => ({
        ...prev,
        error: null,
      }))
      await audioRef.current.play()
      setState((prev) => ({
        ...prev,
        isPlaying: true,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to play audio'
      setState((prev) => ({
        ...prev,
        error: message,
        isPlaying: false,
      }))
    }
  }, [])

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setState((prev) => ({
        ...prev,
        isPlaying: false,
      }))
    }
  }, [])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration))
    }
  }, [])

  const reset = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
      error: null,
    }))
  }, [])

  return {
    ...state,
    play,
    pause,
    seek,
    reset,
  }
}
