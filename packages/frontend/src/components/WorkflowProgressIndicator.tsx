/**
 * WorkflowProgressIndicator - Visual progress through workflow stages
 *
 * Displays: Transcribe → Extract → Generate → DB Update
 * Shows status for each stage: pending, started, completed, or failed
 */

import { StageProgress } from '../types/websocket'

interface WorkflowProgressIndicatorProps {
  stageProgress: StageProgress
  stageDurations?: {
    transcribe?: number
    extract?: number
    generate?: number
    db_update?: number
  }
}

export function WorkflowProgressIndicator({
  stageProgress,
  stageDurations = {},
}: WorkflowProgressIndicatorProps) {
  const stages = [
    { key: 'transcribe' as const, label: '🎤 Transcribe' },
    { key: 'extract' as const, label: '📋 Extract' },
    { key: 'generate' as const, label: '✨ Generate' },
    { key: 'db_update' as const, label: '💾 Save' },
  ]

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓'
      case 'failed':
        return '✗'
      case 'started':
        return '⟳'
      default:
        return '○'
    }
  }

  const getStageColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 border-green-500/50 text-green-400'
      case 'failed':
        return 'bg-red-500/20 border-red-500/50 text-red-400'
      case 'started':
        return 'bg-blue-500/20 border-blue-500/50 text-blue-400 animate-pulse'
      default:
        return 'bg-slate-600/20 border-slate-500/30 text-slate-400'
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-300">Workflow Progress</h4>

      <div className="grid grid-cols-4 gap-2">
        {stages.map(({ key, label }, idx) => {
          const status = stageProgress[key]
          const duration = stageDurations[key]
          const isActive = status === 'started'

          return (
            <div key={key} className="flex flex-col items-center">
              {/* Stage box */}
              <div
                className={`
                  w-full p-3 rounded border-2 text-center transition-all
                  ${getStageColor(status)}
                  ${isActive ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
                `}
              >
                <div className={`text-2xl ${isActive && status === 'started' ? 'animate-spin' : ''}`}>
                  {getStageIcon(status)}
                </div>
                <div className="text-xs font-medium mt-1 truncate">{label}</div>
                {duration && (
                  <div className="text-xs text-slate-300 mt-1">
                    {Math.round(duration)}ms
                  </div>
                )}
              </div>

              {/* Connection line to next stage */}
              {idx < stages.length - 1 && (
                <div
                  className={`
                    h-2 w-1 my-1 rounded
                    ${
                      stageProgress[key] === 'completed'
                        ? 'bg-green-500'
                        : 'bg-slate-600'
                    }
                  `}
                ></div>
              )}
            </div>
          )
        })}
      </div>

      {/* Status message */}
      <div className="text-xs text-slate-400">
        {stageProgress.db_update === 'completed' && (
          <p className="text-green-400">✓ Workflow complete!</p>
        )}
        {Object.values(stageProgress).some((s) => s === 'failed') && (
          <p className="text-red-400">✗ Workflow failed</p>
        )}
        {stageProgress.transcribe === 'started' && (
          <p className="text-blue-400">Processing audio transcription...</p>
        )}
        {stageProgress.extract === 'started' && (
          <p className="text-blue-400">Extracting tasks from transcription...</p>
        )}
        {stageProgress.generate === 'started' && (
          <p className="text-blue-400">Generating content for tasks...</p>
        )}
        {stageProgress.db_update === 'started' && (
          <p className="text-blue-400">Saving results to database...</p>
        )}
      </div>
    </div>
  )
}
