/**
 * RecordingPreview - Preview recorded audio before upload
 * Allows user to play back audio and choose to upload or discard
 */

import { useLocalAudioPlayback } from '../hooks/useLocalAudioPlayback'

interface RecordingPreviewProps {
  recordedBlob: Blob
  onUpload: () => void
  onDiscard: () => void
  isUploading?: boolean
  uploadError?: string | null
}

export function RecordingPreview({
  recordedBlob,
  onUpload,
  onDiscard,
  isUploading = false,
  uploadError = null,
}: RecordingPreviewProps) {
  const playback = useLocalAudioPlayback(recordedBlob)
  const sizeKB = (recordedBlob.size / 1024).toFixed(1)
  const durationDisplay = Math.floor(playback.duration)

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Calculate progress percentage
  const progressPercent =
    playback.duration > 0 ? (playback.currentTime / playback.duration) * 100 : 0

  return (
    <div className="space-y-3">
      {/* Recording info */}
      <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg">
        <p className="text-sm text-green-400 font-semibold">Recording saved</p>
        <p className="text-xs text-green-300 mt-1">
          Size: {sizeKB} KB • Duration: {durationDisplay}s
        </p>
      </div>

      {/* Playback controls */}
      <div className="p-4 bg-slate-700/50 border border-slate-600 rounded-lg space-y-3">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={playback.isPlaying ? playback.pause : playback.play}
            disabled={isUploading}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
            aria-label={playback.isPlaying ? 'Pause' : 'Play'}
          >
            {playback.isPlaying ? (
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
      </div>

      {/* Action buttons */}
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

      {/* Upload error display */}
      {uploadError && (
        <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm">
          {uploadError}
        </div>
      )}
    </div>
  )
}
