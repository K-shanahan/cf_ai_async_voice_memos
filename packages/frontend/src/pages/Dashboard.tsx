/**
 * Dashboard - Main page for managing voice memos
 * Features:
 * - RecordButton component for recording
 * - MemoList component showing all memos
 * - MemoDetail view with transcription and extracted tasks
 */

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { RecordButton } from '../components/RecordButton'
import { MemoList } from '../components/MemoList'
import { MemoDetail } from '../components/MemoDetail'
import { MemoStatusProvider } from '../context/MemoStatusProvider'

export function Dashboard() {
  const { isLoaded } = useUser()
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null)
  const [uploadInProgress, setUploadInProgress] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Show toast notification
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  if (!isLoaded) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <p className="text-slate-300">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <MemoStatusProvider>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Recording + List */}
        <div className="lg:col-span-1 space-y-8">
          {/* Record Section */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Record New Memo</h2>
            <RecordButton
              onUploadStart={() => setUploadInProgress(true)}
              onUploadSuccess={(taskId) => {
                setUploadInProgress(false)
                setSelectedMemoId(taskId)
                setToastMessage('Memo uploaded! Starting to process...')
              }}
              onError={(error) => {
                setUploadInProgress(false)
                setToastMessage(`Error: ${error}`)
              }}
            />
          </section>

          {/* Memos List Section */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Your Memos</h2>
            </div>
            <MemoList
              isLoading={uploadInProgress}
              onMemoClick={(taskId) => setSelectedMemoId(taskId)}
            />
          </section>
        </div>

        {/* Right Column: Detail View */}
        <div className="lg:col-span-2">
          {selectedMemoId ? (
            <section className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <MemoDetail
                taskId={selectedMemoId}
                onClose={() => setSelectedMemoId(null)}
                onDelete={() => {
                  setSelectedMemoId(null)
                  setToastMessage('Memo deleted')
                }}
              />
            </section>
          ) : (
            <section className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center py-12">
              <p className="text-slate-300 font-semibold mb-2">Select a memo to view details</p>
              <p className="text-slate-400 text-sm">
            Stuck for inspiration? Try "Remind me to email the client tomorrow about the new proposal"
              </p>
            </section>
            
            
          )}
        </div>
      </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-4 right-4 p-4 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 shadow-lg max-w-xs">
            {toastMessage}
          </div>
        )}
      </main>
    </MemoStatusProvider>
  )
}
