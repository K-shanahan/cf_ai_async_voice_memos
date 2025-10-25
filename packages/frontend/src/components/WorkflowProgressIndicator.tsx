/**
 * WorkflowProgressIndicator - Timeline visualization of workflow progress
 *
 * Displays: Upload → Transcribe → Extract → Generate
 * Shows a horizontal timeline with colored dots and connecting lines
 * Features smooth animations and visual hierarchy for better UX
 */

import { StageProgress } from '../types/websocket'

interface WorkflowProgressIndicatorProps {
  stageProgress: StageProgress
}

export function WorkflowProgressIndicator({
  stageProgress,
}: WorkflowProgressIndicatorProps) {
  const stages = [
    { key: 'upload' as const, label: 'Upload' },
    { key: 'transcribe' as const, label: 'Transcribe' },
    { key: 'extract' as const, label: 'Extract' },
    { key: 'generate' as const, label: 'Generate' },
  ]

  // Determine the last completed stage index
  const getLastCompletedIndex = () => {
    let lastCompleted = -1
    stages.forEach((stage, idx) => {
      const status = stage.key === 'upload' ? 'completed' : stageProgress[stage.key as keyof StageProgress]
      if (status === 'completed') {
        lastCompleted = idx
      }
    })
    return lastCompleted
  }

  // Determine if a stage is pending and queued (comes after last completed)
  const getQueuedPendingIndex = () => {
    const lastCompleted = getLastCompletedIndex()
    return stages.findIndex((stage, idx) => {
      const status = stage.key === 'upload' ? 'completed' : stageProgress[stage.key as keyof StageProgress]
      return status === 'pending' && idx === lastCompleted + 1
    })
  }

  const lastCompletedIdx = getLastCompletedIndex()
  const queuedPendingIdx = getQueuedPendingIndex()

  const getDotColor = (index: number, status: string) => {
    if (status === 'completed') return 'bg-green-500'
    if (status === 'failed') return 'bg-red-500'
    if (status === 'started') return 'bg-blue-500'
    // Queued pending stage gets subtle blue tint
    if (status === 'pending' && index === queuedPendingIdx) return 'bg-slate-500'
    return 'bg-slate-600'
  }

  const getLineColor = (index: number) => {
    // Line is green if the stage before it is completed
    if (index <= lastCompletedIdx) return 'bg-green-500'
    // Lines after completed are always gray/slate
    return 'bg-slate-600'
  }

  return (
    <div className="space-y-6 p-4 rounded-lg bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/50 backdrop-blur-sm">
      {/* Header */}
      <h4 className="text-base font-bold text-slate-100 tracking-wide">Processing Progress</h4>

      {/* Timeline */}
      <div className="flex items-end gap-0">
        {stages.map(({ key, label }, idx) => {
          const status = key === 'upload' ? 'completed' : stageProgress[key as keyof StageProgress]
          const isActive = status === 'started'
          const isQueuedPending = status === 'pending' && idx === queuedPendingIdx

          return (
            <div key={key} className="flex-1 flex flex-col items-center">
              {/* Stage label */}
              <div
                className={`text-xs font-semibold mb-3 h-5 transition-colors ${
                  isActive ? 'text-blue-300' : isQueuedPending ? 'text-slate-300' : status === 'completed' ? 'text-green-300' : 'text-slate-400'
                }`}
              >
                {label}
              </div>

              {/* Dot and line container */}
              <div className="flex items-center w-full">
                {/* Connecting line from previous stage */}
                {idx > 0 && (
                  <div className={`flex-1 h-1.5 ${getLineColor(idx - 1)} transition-all duration-300`}></div>
                )}

                {/* Dot */}
                <div className="flex-shrink-0 relative">
                  <div
                    className={`
                      w-6 h-6 rounded-full border-2 border-slate-600 transition-all duration-300
                      ${getDotColor(idx, status)}
                      ${isActive ? 'ring-2 ring-offset-2 ring-blue-400 ring-offset-slate-800 shadow-lg shadow-blue-500/50' : ''}
                      ${isQueuedPending ? 'ring-2 ring-offset-2 ring-slate-400 ring-offset-slate-800' : ''}
                    `}
                  >
                    {/* Loading animation for active stage with fade-in */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-full animate-ping bg-blue-400 opacity-75"></div>
                    )}
                    {/* Subtle pulse for queued pending stage */}
                    {isQueuedPending && (
                      <div className="absolute inset-0 rounded-full opacity-0 animate-pulse bg-slate-400"></div>
                    )}
                    {/* Checkmark for completed stages */}
                    {status === 'completed' && (
                      <div className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
                        ✓
                      </div>
                    )}
                    {/* X for failed stages */}
                    {status === 'failed' && (
                      <div className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
                        ×
                      </div>
                    )}
                  </div>
                </div>

                {/* Connecting line to next stage */}
                {idx < stages.length - 1 && (
                  <div className={`flex-1 h-1.5 ${getLineColor(idx)} transition-all duration-300`}></div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Status message */}
      <div className="text-sm mt-4 min-h-6">
        {stageProgress.generate === 'completed' && (
          <p className="text-green-400 font-semibold animate-fade-in">✓ Workflow complete!</p>
        )}
        {Object.values(stageProgress).some((s) => s === 'failed') && (
          <p className="text-red-400 font-semibold animate-fade-in">✕ Workflow failed</p>
        )}
        {stageProgress.transcribe === 'started' && (
          <p className="text-blue-300 font-medium animate-fade-in">◆ Processing audio transcription...</p>
        )}
        {stageProgress.transcribe === 'pending' && lastCompletedIdx >= 0 && (
          <p className="text-slate-300 font-medium animate-fade-in">○ Transcription queued...</p>
        )}
        {stageProgress.extract === 'started' && (
          <p className="text-blue-300 font-medium animate-fade-in">◆ Extracting tasks from transcription...</p>
        )}
        {stageProgress.generate === 'started' && (
          <p className="text-blue-300 font-medium animate-fade-in">◆ Generating content for tasks...</p>
        )}
      </div>
    </div>
  )
}
