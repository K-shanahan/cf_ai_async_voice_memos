import { useContext } from 'react'
import { MemoStatusContext, type MemoStatusContextType } from '../context/MemoStatusProvider'

export function useMemoStatus(): MemoStatusContextType {
  const context = useContext(MemoStatusContext)
  if (!context) {
    throw new Error('useMemoStatus must be used within MemoStatusProvider')
  }
  return context
}
