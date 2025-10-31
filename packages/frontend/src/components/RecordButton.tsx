/**
 * RecordButton - Record voice memos
 * Handles recording lifecycle and audio blob generation
 * Dispatches MEMO_CREATED action to global MemoStatusProvider
 */

import { useState } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import { useUploadMemo } from '../hooks/useMemoApi'
import { useMemoStatus } from '../hooks/useMemoStatus'
import { VolumeMeter } from './VolumeMeter'
import { RecordingPreview } from './RecordingPreview'

interface RecordButtonProps {
  onUploadStart?: () => void
  onUploadSuccess?: (taskId: string) => void
  onError?: (error: string) => void
}

export function RecordButton({ onUploadStart, onUploadSuccess, onError }: RecordButtonProps) {
  const recorder = useRecorder()
  const uploadMemo = useUploadMemo()
  const { dispatch } = useMemoStatus()
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

      // Dispatch MEMO_CREATED action to add to global state
      const now = new Date().toISOString()
      dispatch({
        type: 'MEMO_CREATED',
        payload: {
          taskId: response.taskId,
          memo: {
            taskId: response.taskId,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            stageProgress: {
              transcribe: 'pending',
              extract: 'pending',
              generate: 'pending',
            },
          },
        },
      })

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
        <div className="p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <div className="text-lg font-semibold text-blue-400">
              {String(recorder.duration).padStart(2, '0')}s
            </div>
          </div>

          <div className="flex justify-center py-4">
            <VolumeMeter volume={recorder.volume} barCount={8} isActive={true} />
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
    return (
      <RecordingPreview
        recordedBlob={recordedBlob}
        onUpload={handleUpload}
        onDiscard={handleDiscardRecording}
        isUploading={uploadMemo.isPending}
        uploadError={uploadMemo.error?.message || null}
      />
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
