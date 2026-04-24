import type { Edge, Node, XYPosition } from '@xyflow/react'

export type NoteNodeData = {
  kind: 'note'
  title: string
  content: string
  collapsed?: boolean
}

export type PdfNodeData = {
  kind: 'pdf'
  title: string
  summary: string
  fileId: string
  collapsed?: boolean
}

export type NoteCanvasNode = Node<NoteNodeData, 'note'>
export type PdfCanvasNode = Node<PdfNodeData, 'pdf'>

export type MindNode = NoteCanvasNode | PdfCanvasNode
export type MindEdge = Edge

export type WorkspaceSnapshot = {
  nodes: MindNode[]
  edges: MindEdge[]
}

export type ExportBundle = {
  version: 1
  exportedAt: string
  snapshot: WorkspaceSnapshot
  pdfFiles: Record<string, string>
}

export type NodePlacement = {
  position: XYPosition
}