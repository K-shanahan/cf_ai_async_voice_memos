/**
 * AudioPlayer - Play or download audio file
 */

import { useState } from 'react'
import { useDownloadAudio } from '../hooks/useMemoApi'

interface AudioPlayerProps {
  taskId: string
}

export function AudioPlayer({ taskId }: AudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const download = useDownloadAudio()

  const handlePlayClick = async () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.play()
      return
    }

    try {
      const blob = await download.mutateAsync(taskId)
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)

      const audio = new Audio(url)
      audio.play()
    } catch (error) {
      console.error('Failed to load audio:', error)
    }
  }

  const handleDownloadClick = async () => {
    try {
      let blob = null

      if (audioUrl) {
        // Convert existing data URL to blob
        const response = await fetch(audioUrl)
        blob = await response.blob()
      } else {
        blob = await download.mutateAsync(taskId)
      }

      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `memo-${taskId}.webm`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download audio:', error)
    }
  }

  return (
    <div className="space-y-3">
      {audioUrl && (
        <div className="p-3 bg-blue-500/10 border border-blue-500 rounded-lg">
          <audio src={audioUrl} controls className="w-full" />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handlePlayClick}
          disabled={download.isPending}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-semibold"
        >
          {download.isPending ? '⏳ Loading...' : '▶️ Play'}
        </button>

        <button
          onClick={handleDownloadClick}
          disabled={download.isPending}
          className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-semibold"
        >
          ⬇️
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
