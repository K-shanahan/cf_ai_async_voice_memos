/**
 * AudioPreview - Unified audio playback component
 * Used for both recording preview (before upload) and memo playback (after upload)
 *
 * Modes:
 * - Recording preview: Shows with recordedBlob + upload/discard actions
 * - Memo playback: Shows with taskId + download button (fetches from backend)
 */

import { useState, useRef, useEffect } from 'react'
import { useLocalAudioPlayback } from '../hooks/useLocalAudioPlayback'
import { useDownloadAudio } from '../hooks/useMemoApi'

interface AudioPreviewProps {
  // Recording preview mode
  recordedBlob?: Blob
  onUpload?: () => void
  onDiscard?: () => void
  isUploading?: boolean
  uploadError?: string | null

  // Memo playback mode
  taskId?: string
  showDownloadButton?: boolean
}

export function AudioPreview({
  recordedBlob,
  onUpload,
  onDiscard,
  isUploading = false,
  uploadError = null,
  taskId,
  showDownloadButton = true,
}: AudioPreviewProps) {
  const [downloadedBlob, setDownloadedBlob] = useState<Blob | null>(null)
  const downloadAudio = useDownloadAudio()
  const previousUrlRef = useRef<string | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  // Determine which blob to use (either recorded or downloaded)
  const blob = recordedBlob || downloadedBlob
  const playback = useLocalAudioPlayback(blob)

  // For recording preview, calculate size
  const sizeKB = recordedBlob ? (recordedBlob.size / 1024).toFixed(1) : undefined
  const durationDisplay = Math.floor(playback.duration)

  // Determine if this is recording preview or memo playback mode
  const isRecordingMode = !!recordedBlob && !!onUpload && !!onDiscard
  const isMemoMode = !!taskId && !recordedBlob

  // Clean up blob URLs when component unmounts or taskId changes
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
      }
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current)
        previousUrlRef.current = null
      }
    }
  }, [taskId])

  // Download audio when in memo mode and user initiates playback
  const handlePlayClick = async () => {
    if (isMemoMode && !downloadedBlob) {
      try {
        const blob = await downloadAudio.mutateAsync(taskId)
        setDownloadedBlob(blob)
        return
      } catch (error) {
        console.error('Failed to download audio:', error)
        return
      }
    }

    // Play the audio
    if (playback.isPlaying) {
      playback.pause()
    } else {
      await playback.play()
    }
  }

  const handleDownload = async () => {
    try {
      let blobToDownload = downloadedBlob

      if (!blobToDownload && taskId) {
        blobToDownload = await downloadAudio.mutateAsync(taskId)
      }

      if (!blobToDownload) {
        return
      }

      // Create temporary download link and trigger download
      const downloadUrl = URL.createObjectURL(blobToDownload)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `memo-${taskId}.webm`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up the temporary download URL
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Failed to download audio:', error)
    }
  }

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Calculate progress percentage
  const progressPercent =
    playback.duration > 0 ? (playback.currentTime / playback.duration) * 100 : 0

  // Determine if audio is loading
  const isLoading = isMemoMode && downloadAudio.isPending && !downloadedBlob

  return (
    <div className="space-y-3">
      {/* Info section - differs based on mode */}
      <div className={`p-4 border rounded-lg ${isRecordingMode ? 'bg-green-500/10 border-green-500' : 'bg-blue-500/10 border-blue-500'}`}>
        {isRecordingMode && (
          <>
            <p className="text-sm text-green-400 font-semibold">Recording saved</p>
            <p className="text-xs text-green-300 mt-1">
              Size: {sizeKB} KB • Duration: {durationDisplay}s
            </p>
          </>
        )}
        {isMemoMode && (
          <>
            <p className="text-sm text-blue-400 font-semibold">Audio memo</p>
            <p className="text-xs text-blue-300 mt-1">
              Duration: {durationDisplay}s
            </p>
          </>
        )}
      </div>

      {/* Playback controls */}
      <div className="p-4 bg-slate-700/50 border border-slate-600 rounded-lg space-y-3">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handlePlayClick}
            disabled={isLoading || isUploading}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
            aria-label={playback.isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : playback.isPlaying ? (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Progress bar */}
          <div className="flex-1 space-y-2">
            <div
              className="h-1 bg-slate-600 rounded-full overflow-hidden cursor-pointer hover:h-2 transition-all"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const percent = (e.clientX - rect.left) / rect.width
                playback.seek(percent * playback.duration)
              }}
            >
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Time display */}
            <div className="flex justify-between text-xs text-slate-400">
              <span>{formatTime(playback.currentTime)}</span>
              <span>{formatTime(playback.duration)}</span>
            </div>
          </div>
        </div>

        {/* Error display */}
        {playback.error && (
          <div className="text-xs text-red-400 text-center p-2 bg-red-500/10 rounded">
            {playback.error}
          </div>
        )}
        {downloadAudio.error && (
          <div className="text-xs text-red-400 text-center p-2 bg-red-500/10 rounded">
            {downloadAudio.error.message || 'Failed to download audio'}
          </div>
        )}
      </div>

      {/* Action buttons - differs based on mode */}
      {isRecordingMode && (
        <div className="flex gap-2">
          <button
            onClick={onUpload}
            disabled={isUploading || playback.error !== null}
            className="flex-1 px-4 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>

          <button
            onClick={onDiscard}
            disabled={isUploading}
            className="px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Discard
          </button>
        </div>
      )}

      {isMemoMode && showDownloadButton && (
        <button
          onClick={handleDownload}
          disabled={isLoading || !downloadedBlob}
          className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
        >
          Download
        </button>
      )}

      {/* Error display */}
      {uploadError && (
        <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm">
          {uploadError}
        </div>
      )}
    </div>
  )
}

// Export both names for backward compatibility during migration
export { AudioPreview as RecordingPreview }
