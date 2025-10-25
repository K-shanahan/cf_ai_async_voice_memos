/**
 * AudioPlayer - Play or download audio file
 *
 * Handles audio playback with proper cleanup to prevent:
 * - Playing wrong audio when switching memos
 * - Memory leaks from unreleased blob URLs
 * - Overlapping audio playback
 */

import { useState, useRef, useEffect } from 'react'
import { useDownloadAudio } from '../hooks/useMemoApi'

interface AudioPlayerProps {
  taskId: string
}

export function AudioPlayer({ taskId }: AudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const previousUrlRef = useRef<string | null>(null)
  const download = useDownloadAudio()

  // Clean up blob URLs and stop audio when component unmounts or taskId changes
  useEffect(() => {
    return () => {
      // Stop any currently playing audio
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
      }

      // Revoke previous blob URL to free memory (but not the current one being used)
      if (previousUrlRef.current && previousUrlRef.current !== audioUrl) {
        URL.revokeObjectURL(previousUrlRef.current)
        previousUrlRef.current = null
      }
    }
  }, [taskId])

  // Cleanup the current audioUrl when component is about to unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [])

  const handlePlayClick = async () => {
    if (!audioUrl) {
      // Need to download the audio first
      try {
        const blob = await download.mutateAsync(taskId)
        const url = URL.createObjectURL(blob)
        previousUrlRef.current = audioUrl
        setAudioUrl(url)
        // Audio element will be rendered with the URL, user can play it from controls
        return
      } catch (error) {
        console.error('Failed to load audio:', error)
        return
      }
    }

    // Play the audio element that's already rendered
    if (audioElementRef.current) {
      audioElementRef.current.play().catch((error) => {
        console.error('Failed to play audio:', error)
      })
    }
  }

  const handleDownloadClick = async () => {
    try {
      let blob = null

      if (audioUrl) {
        // Convert existing blob URL to blob for download
        const response = await fetch(audioUrl)
        blob = await response.blob()
      } else {
        blob = await download.mutateAsync(taskId)
      }

      // Create temporary download link and trigger download
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `memo-${taskId}.webm`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up the temporary download URL (separate from audio playback URL)
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Failed to download audio:', error)
    }
  }

  return (
    <div className="space-y-3">
      {audioUrl && (
        <div className="p-3 bg-blue-500/10 border border-blue-500 rounded-lg">
          <audio ref={audioElementRef} src={audioUrl} controls className="w-full" />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handlePlayClick}
          disabled={download.isPending}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-semibold"
        >
          {download.isPending ? 'Loading...' : 'Play'}
        </button>

        <button
          onClick={handleDownloadClick}
          disabled={download.isPending}
          className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-semibold"
        >
          Download
        </button>
      </div>

      {download.error && (
        <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm">
          {download.error.message || 'Failed to load audio'}
        </div>
      )}
    </div>
  )
}
