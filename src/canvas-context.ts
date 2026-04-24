import { createContext, useContext } from 'react'

import type { NoteNodeData, PdfNodeData } from './types'

type CanvasContextValue = {
  updateNoteNode: (id: string, patch: Partial<NoteNodeData>) => void
  updatePdfNode: (id: string, patch: Partial<PdfNodeData>) => void
  removeNode: (id: string) => void
  getPdfFile: (fileId: string) => Blob | null
}

export const CanvasContext = createContext<CanvasContextValue | null>(null)

export function useCanvasContext() {
  const value = useContext(CanvasContext)

  if (!value) {
    throw new Error('CanvasContext is not available')
  }

  return value
}