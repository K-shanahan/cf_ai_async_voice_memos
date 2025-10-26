import { useContext } from 'react'
import { MemoStatusContext } from '../context/MemoStatusProvider'

export function useMemoStatus() {
  const context = useContext(MemoStatusContext)
  if (!context) {
    throw new Error('useMemoStatus must be used within MemoStatusProvider')
  }
  return context
}
