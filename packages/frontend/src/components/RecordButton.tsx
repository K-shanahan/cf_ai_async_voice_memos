/**
 * RecordButton - Record voice memos
 * Handles recording lifecycle and audio blob generation
 */

import { useState } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import { useUploadMemo } from '../hooks/useMemoApi'

interface RecordButtonProps {
  onUploadStart?: () => void
  onUploadSuccess?: (taskId: string) => void
  onError?: (error: string) => void
}

export function RecordButton({ onUploadStart, onUploadSuccess, onError }: RecordButtonProps) {
  const recorder = useRecorder()
  const uploadMemo = useUploadMemo()
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)

  if (!recorder.isSupported) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-500">
        <p>Microphone access not supported in your browser</p>
      </div>
    )
  }

  if (recorder.error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-500">
        <p className="font-semibold mb-2">Recording Error</p>
        <p className="text-sm">{recorder.error}</p>
        <button
          onClick={() => recorder.reset()}
          className="mt-3 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
        >
          Try Again
        </button>
      </div>
    )
  }

  const handleStartRecording = async () => {
    recorder.reset()
    await recorder.startRecording()
  }

  const handleStopRecording = async () => {
    const blob = await recorder.stopRecording()
    if (blob) {
      setRecordedBlob(blob)
    }
  }

  const handleDiscardRecording = () => {
    recorder.reset()
    setRecordedBlob(null)
  }

  const handleUpload = async () => {
    if (!recordedBlob) return

    onUploadStart?.()

    try {
      const response = await uploadMemo.mutateAsync(recordedBlob)
      setRecordedBlob(null)
      recorder.reset()
      onUploadSuccess?.(response.taskId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      onError?.(message)
    }
  }

  // Recording in progress
  if (recorder.isRecording) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-3 p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
          <div className="text-lg font-semibold text-blue-400">
            {String(recorder.duration).padStart(2, '0')}s
          </div>
        </div>

        <button
          onClick={handleStopRecording}
          className="w-full px-4 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition"
        >
          Stop Recording
        </button>
      </div>
    )
  }

  // Recorded audio ready for upload
  if (recordedBlob) {
    const sizeKB = (recordedBlob.size / 1024).toFixed(1)

    return (
      <div className="space-y-3">
        <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg">
          <p className="text-sm text-green-400 font-semibold">Recording saved</p>
          <p className="text-xs text-green-300 mt-1">Size: {sizeKB} KB</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleUpload}
            disabled={uploadMemo.isPending}
            className="flex-1 px-4 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {uploadMemo.isPending ? 'Uploading...' : 'Upload'}
          </button>

          <button
            onClick={handleDiscardRecording}
            disabled={uploadMemo.isPending}
            className="px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Discard
          </button>
        </div>

        {uploadMemo.error && (
          <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm">
            {uploadMemo.error.message || 'Upload failed'}
          </div>
        )}
      </div>
    )
  }

  // Ready to record
  return (
    <button
      onClick={handleStartRecording}
      className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-lg rounded-lg hover:from-blue-600 hover:to-blue-700 transition shadow-lg"
    >
      Start Recording
    </button>
  )
}
