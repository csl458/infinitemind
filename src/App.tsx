import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type Edge,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react'

import '@xyflow/react/dist/style.css'

import { CanvasContext } from './canvas-context'
import NoteNode from './nodes/NoteNode'
import PdfNode from './nodes/PdfNode'
import {
  createExportBundle,
  loadPdfFiles,
  loadSnapshot,
  removePdfFile,
  restorePdfFiles,
  savePdfFile,
  saveSnapshot,
} from './storage'
import type {
  ExportBundle,
  MindEdge,
  MindNode,
  NoteNodeData,
  PdfNodeData,
  WorkspaceSnapshot,
} from './types'

const nodeTypes = {
  note: NoteNode,
  pdf: PdfNode,
}

const defaultEdgeOptions = {
  type: 'smoothstep',
  style: {
    stroke: '#5f7468',
    strokeWidth: 2,
  },
}

const starterSnapshot: WorkspaceSnapshot = {
  nodes: [
    {
      id: 'note-root',
      type: 'note',
      position: { x: 420, y: 90 },
      data: {
        kind: 'note',
        title: 'Knowledge Brain',
        content:
          '把论文、报告、灵感和行动项放到同一张无限画布里。你可以继续扩展节点、连线和结构。',
        collapsed: false,
      },
    },
    {
      id: 'note-reading',
      type: 'note',
      position: { x: 90, y: 300 },
      data: {
        kind: 'note',
        title: '阅读入口',
        content: '点击“导入 PDF”或直接把 PDF 拖到画布里。每个 PDF 节点都可以附带你的摘要和争议点。',
        collapsed: false,
      },
    },
    {
      id: 'note-thinking',
      type: 'note',
      position: { x: 460, y: 360 },
      data: {
        kind: 'note',
        title: '思考节点',
        content: '用文本卡片沉淀公式推导、方法比较、实验假设和下一步行动。',
        collapsed: false,
      },
    },
    {
      id: 'note-structure',
      type: 'note',
      position: { x: 820, y: 290 },
      data: {
        kind: 'note',
        title: '结构连接',
        content: '上下拖拽节点建立主干，连线可以表达引用、因果、对比或待验证关系。',
        collapsed: false,
      },
    },
  ],
  edges: [
    { id: 'edge-root-reading', source: 'note-root', target: 'note-reading' },
    { id: 'edge-root-thinking', source: 'note-root', target: 'note-thinking' },
    { id: 'edge-root-structure', source: 'note-root', target: 'note-structure' },
  ],
}

type NavTreeNode = {
  id: string
  label: string
  kind: 'PDF' | 'NOTE'
  children: NavTreeNode[]
}

type NavTreeItemProps = {
  item: NavTreeNode
  depth: number
  collapsedIds: Record<string, boolean>
  onToggle: (id: string) => void
  onFocus: (id: string) => void
}

type CanvasHistoryState = {
  nodes: MindNode[]
  edges: MindEdge[]
  pdfFiles: Record<string, Blob>
}

type LayoutMode = 'horizontal' | 'vertical'

const MAX_HISTORY_ENTRIES = 60

function App() {
  return (
    <ReactFlowProvider>
      <MindCanvas />
    </ReactFlowProvider>
  )
}

function NavTreeItem({ item, depth, collapsedIds, onToggle, onFocus }: NavTreeItemProps) {
  const hasChildren = item.children.length > 0
  const isCollapsed = collapsedIds[item.id] ?? false

  return (
    <div className="nav-tree__branch">
      <div className="nav-tree__row" style={{ paddingLeft: `${depth * 18}px` }}>
        {hasChildren ? (
          <button
            type="button"
            className="nav-tree__toggle"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? '展开层级' : '收起层级'}
            onClick={() => onToggle(item.id)}
          >
            {isCollapsed ? '+' : '−'}
          </button>
        ) : (
          <span className="nav-tree__toggle-spacer" aria-hidden="true" />
        )}

        <button type="button" className="nav-panel__item" onClick={() => onFocus(item.id)}>
          <span className="nav-panel__item-type">{item.kind}</span>
          <span className="nav-panel__item-title">{item.label}</span>
        </button>
      </div>

      {hasChildren && !isCollapsed ? (
        <div className="nav-tree__children">
          {item.children.map((child) => (
            <NavTreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              onFocus={onFocus}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MindCanvas() {
  const reactFlow = useReactFlow<MindNode, MindEdge>()
  const importRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [nodes, setNodes] = useNodesState<MindNode>([])
  const [edges, setEdges] = useEdgesState<MindEdge>([])
  const [pdfFiles, setPdfFiles] = useState<Record<string, Blob>>({})
  const [isReady, setIsReady] = useState(false)
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(true)
  const [isHintPanelOpen, setIsHintPanelOpen] = useState(true)
  const [isNavOpen, setIsNavOpen] = useState(true)
  const [collapsedNavIds, setCollapsedNavIds] = useState<Record<string, boolean>>({})
  const canvasStateRef = useRef<CanvasHistoryState>({ nodes: [], edges: [], pdfFiles: {} })
  const undoStackRef = useRef<CanvasHistoryState[]>([])
  const redoStackRef = useRef<CanvasHistoryState[]>([])
  const pdfStoreSyncQueueRef = useRef(Promise.resolve())

  function queuePdfStoreSync(previousPdfFiles: Record<string, Blob>, nextPdfFiles: Record<string, Blob>) {
    pdfStoreSyncQueueRef.current = pdfStoreSyncQueueRef.current
      .catch(() => undefined)
      .then(() => syncPdfFileStore(previousPdfFiles, nextPdfFiles))
  }

  function applyCanvasState(
    nextState: CanvasHistoryState,
    options: { recordHistory?: boolean } = {},
  ) {
    const currentState = canvasStateRef.current

    if (
      nextState.nodes === currentState.nodes &&
      nextState.edges === currentState.edges &&
      nextState.pdfFiles === currentState.pdfFiles
    ) {
      return false
    }

    if (options.recordHistory ?? true) {
      undoStackRef.current = pushHistoryEntry(undoStackRef.current, currentState)
      redoStackRef.current = []
    }

    const normalizedState = cloneCanvasHistoryState(nextState)
    canvasStateRef.current = normalizedState
    setNodes(normalizedState.nodes)
    setEdges(normalizedState.edges)
    setPdfFiles(normalizedState.pdfFiles)
    queuePdfStoreSync(currentState.pdfFiles, normalizedState.pdfFiles)

    return true
  }

  const restoreCanvasState = useEffectEvent((historyState: CanvasHistoryState) => {
    const currentState = canvasStateRef.current
    const normalizedState = cloneCanvasHistoryState(historyState)

    canvasStateRef.current = normalizedState
    setNodes(normalizedState.nodes)
    setEdges(normalizedState.edges)
    setPdfFiles(normalizedState.pdfFiles)
    queuePdfStoreSync(currentState.pdfFiles, normalizedState.pdfFiles)
  })

  const undo = useEffectEvent(() => {
    const previousState = undoStackRef.current.pop()

    if (!previousState) {
      return
    }

    redoStackRef.current = pushHistoryEntry(redoStackRef.current, canvasStateRef.current)
    restoreCanvasState(previousState)
  })

  const redo = useEffectEvent(() => {
    const nextState = redoStackRef.current.pop()

    if (!nextState) {
      return
    }

    undoStackRef.current = pushHistoryEntry(undoStackRef.current, canvasStateRef.current)
    restoreCanvasState(nextState)
  })

  useEffect(() => {
    canvasStateRef.current = { nodes, edges, pdfFiles }
  }, [edges, nodes, pdfFiles])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const snapshot = await loadSnapshot()

      if (!snapshot) {
        if (!cancelled) {
          const initialState = cloneCanvasHistoryState({
            nodes: starterSnapshot.nodes,
            edges: starterSnapshot.edges,
            pdfFiles: {},
          })

          undoStackRef.current = []
          redoStackRef.current = []
          canvasStateRef.current = initialState

          startTransition(() => {
            setNodes(initialState.nodes)
            setEdges(initialState.edges)
            setPdfFiles(initialState.pdfFiles)
            setIsReady(true)
          })
        }

        return
      }

      const fileIds = snapshot.nodes.flatMap((node) => {
        if (node.type !== 'pdf' || node.data.kind !== 'pdf') {
          return []
        }

        return [node.data.fileId]
      })

      const restoredPdfFiles = await loadPdfFiles(fileIds)

      if (cancelled) {
        return
      }

      const initialState = cloneCanvasHistoryState({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        pdfFiles: restoredPdfFiles,
      })

      undoStackRef.current = []
      redoStackRef.current = []
      canvasStateRef.current = initialState

      startTransition(() => {
        setNodes(initialState.nodes)
        setEdges(initialState.edges)
        setPdfFiles(initialState.pdfFiles)
        setIsReady(true)
      })
    })()

    return () => {
      cancelled = true
    }
  }, [setEdges, setNodes])

  useEffect(() => {
    if (!isReady) {
      return
    }

    const timer = window.setTimeout(() => {
      void saveSnapshot({ nodes, edges })
    }, 240)

    return () => {
      window.clearTimeout(timer)
    }
  }, [edges, isReady, nodes])

  useEffect(() => {
    if (!isReady) {
      return
    }

    function onWindowKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const wantsUndo = key === 'z' && !event.shiftKey
      const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey)

      if (!wantsUndo && !wantsRedo) {
        return
      }

      event.preventDefault()

      if (wantsUndo) {
        undo()
        return
      }

      redo()
    }

    window.addEventListener('keydown', onWindowKeyDown)

    return () => {
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  }, [isReady])

  function onNodesChange(changes: NodeChange<MindNode>[]) {
    if (!changes.length) {
      return
    }

    const currentState = canvasStateRef.current
    const removedNodeIds = new Set(
      changes.filter((change) => change.type === 'remove').map((change) => change.id),
    )

    applyCanvasState(
      {
        nodes: applyNodeChanges(changes, currentState.nodes),
        edges: removedNodeIds.size
          ? currentState.edges.filter(
              (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
            )
          : currentState.edges,
        pdfFiles: removedNodeIds.size
          ? dropPdfFilesForRemovedNodes(currentState.nodes, currentState.pdfFiles, removedNodeIds)
          : currentState.pdfFiles,
      },
      { recordHistory: shouldTrackNodeChanges(changes) },
    )
  }

  function onEdgesChange(changes: EdgeChange<MindEdge>[]) {
    if (!changes.length) {
      return
    }

    const currentState = canvasStateRef.current

    applyCanvasState(
      {
        nodes: currentState.nodes,
        edges: applyEdgeChanges(changes, currentState.edges),
        pdfFiles: currentState.pdfFiles,
      },
      { recordHistory: shouldTrackEdgeChanges(changes) },
    )
  }

  function getViewportSpawn(offset = 0): XYPosition {
    return reactFlow.screenToFlowPosition({
      x: window.innerWidth / 2 + offset * 28,
      y: 220 + offset * 24,
    })
  }

  function addNote() {
    const currentState = canvasStateRef.current
    const node = createNoteNode(getViewportSpawn(currentState.nodes.length % 4))

    applyCanvasState({
      nodes: currentState.nodes.concat(node),
      edges: currentState.edges,
      pdfFiles: currentState.pdfFiles,
    })
  }

  function addPdfFiles(files: File[], anchor?: XYPosition) {
    const incomingFiles = files.filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    )

    if (!incomingFiles.length) {
      return
    }

    const currentState = canvasStateRef.current
    const nextPdfFiles: Record<string, Blob> = {}
    const nextNodes = incomingFiles.map((file, index) => {
      const fileId = createId('pdf')
      const basePosition = anchor ?? getViewportSpawn(index)

      nextPdfFiles[fileId] = file

      return createPdfNode(
        {
          x: basePosition.x + index * 26,
          y: basePosition.y + index * 22,
        },
        file.name.replace(/\.pdf$/i, ''),
        fileId,
      )
    })

    applyCanvasState({
      nodes: currentState.nodes.concat(nextNodes),
      edges: currentState.edges,
      pdfFiles: {
        ...currentState.pdfFiles,
        ...nextPdfFiles,
      },
    })
  }

  function updateNoteNode(id: string, patch: Partial<NoteNodeData>) {
    const currentState = canvasStateRef.current

    applyCanvasState({
      nodes: currentState.nodes.map((node) => {
        if (node.id !== id || node.type !== 'note' || node.data.kind !== 'note') {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            ...patch,
          },
        }
      }),
      edges: currentState.edges,
      pdfFiles: currentState.pdfFiles,
    })
  }

  function updatePdfNode(id: string, patch: Partial<PdfNodeData>) {
    const currentState = canvasStateRef.current

    applyCanvasState({
      nodes: currentState.nodes.map((node) => {
        if (node.id !== id || node.type !== 'pdf' || node.data.kind !== 'pdf') {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            ...patch,
          },
        }
      }),
      edges: currentState.edges,
      pdfFiles: currentState.pdfFiles,
    })
  }

  function getPdfFile(fileId: string) {
    return pdfFiles[fileId] ?? null
  }

  function removeNode(nodeId: string) {
    const currentState = canvasStateRef.current
    const removedNodeIds = new Set([nodeId])
    const nextNodes = currentState.nodes.filter((node) => node.id !== nodeId)

    if (nextNodes.length === currentState.nodes.length) {
      return
    }

    applyCanvasState({
      nodes: nextNodes,
      edges: currentState.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
      pdfFiles: dropPdfFilesForRemovedNodes(currentState.nodes, currentState.pdfFiles, removedNodeIds),
    })
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return
    }

    const currentState = canvasStateRef.current

    applyCanvasState({
      nodes: currentState.nodes,
      edges: hasRelation(currentState.edges, connection.source!, connection.target!)
        ? currentState.edges
        : addEdge(createMindEdge(connection.source!, connection.target!), currentState.edges),
      pdfFiles: currentState.pdfFiles,
    })
  }

  function focusNode(nodeId: string) {
    const node = nodes.find((entry) => entry.id === nodeId)

    if (!node) {
      return
    }

    const width = node.width ?? (node.type === 'pdf' ? 340 : 320)
    const height = node.height ?? (node.data.collapsed ? 100 : node.type === 'pdf' ? 440 : 280)

    void reactFlow.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      duration: 280,
      zoom: Math.max(reactFlow.getZoom(), 0.9),
    })
  }

  function focusOverview() {
    void reactFlow.fitView({ duration: 280, padding: 0.18 })
  }

  function arrangeHierarchy(mode: LayoutMode) {
    const currentState = canvasStateRef.current

    applyCanvasState({
      nodes: arrangeNodesByHierarchy(currentState.nodes, currentState.edges, mode),
      edges: currentState.edges,
      pdfFiles: currentState.pdfFiles,
    })

    window.setTimeout(() => {
      void reactFlow.fitView({ duration: 280, padding: 0.2 })
    }, 0)
  }

  function toggleNavBranch(nodeId: string) {
    setCollapsedNavIds((current) => ({
      ...current,
      [nodeId]: !current[nodeId],
    }))
  }

  function onPdfInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    addPdfFiles(files)
    event.target.value = ''
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const droppedFiles = Array.from(event.dataTransfer.files)

    addPdfFiles(
      droppedFiles,
      reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    )
  }

  async function exportWorkspace() {
    const bundle = await createExportBundle({ nodes, edges }, pdfFiles)
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `mind-brain-${new Date().toISOString().slice(0, 10)}.json`
    link.click()

    URL.revokeObjectURL(url)
  }

  function onImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    void (async () => {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)

      if (!isExportBundle(parsed)) {
        throw new Error('Invalid import bundle')
      }

      const restoredPdfFiles = await restorePdfFiles(parsed)

      applyCanvasState({
        nodes: parsed.snapshot.nodes,
        edges: parsed.snapshot.edges,
        pdfFiles: restoredPdfFiles,
      })
    })().catch((error) => {
      console.error(error)
      window.alert('导入失败，文件格式不正确。')
    })

    event.target.value = ''
  }

  async function resetWorkspace() {
    const confirmed = window.confirm('这会清空当前画布和本地 PDF 缓存，确定继续吗？')

    if (!confirmed) {
      return
    }

    applyCanvasState({
      nodes: starterSnapshot.nodes,
      edges: starterSnapshot.edges,
      pdfFiles: {},
    })
  }

  const noteCount = nodes.filter((node) => node.type === 'note').length
  const pdfCount = nodes.filter((node) => node.type === 'pdf').length
  const navTree = buildNavigationTree(nodes, edges)

  return (
    <CanvasContext.Provider
      value={{
        updateNoteNode,
        updatePdfNode,
        removeNode,
        getPdfFile,
      }}
    >
      <div className="app-shell" onDragOver={onDragOver} onDrop={onDrop}>
        <input
          ref={pdfInputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={onPdfInputChange}
        />
        <input
          ref={importRef}
          className="visually-hidden"
          type="file"
          accept="application/json"
          onChange={onImportChange}
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          defaultEdgeOptions={defaultEdgeOptions as Edge}
          nodeTypes={nodeTypes}
          noWheelClassName="nowheel"
          fitView
          minZoom={0.15}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#cbd6cf" gap={24} size={1.1} variant={BackgroundVariant.Dots} />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={3}
            maskColor="rgba(248, 244, 236, 0.72)"
            style={{ backgroundColor: '#f6f1e8', border: '1px solid #d7d0c2' }}
          />
          <Controls showInteractive={false} />

          <Panel position="top-left">
            <section className={`control-panel${isControlPanelOpen ? '' : ' control-panel--collapsed'}`}>
              <div className="control-panel__header">
                <div>
                  <span className="control-panel__eyebrow">Local Canvas</span>
                  <h1>无限大脑</h1>
                </div>
                <button
                  type="button"
                  className="secondary panel-toggle"
                  onClick={() => setIsControlPanelOpen((current) => !current)}
                >
                  {isControlPanelOpen ? '收起' : '展开'}
                </button>
              </div>

              {isControlPanelOpen ? (
                <div className="control-panel__body">
                  <p>
                    在无限画布上组织Paper、结论、问题、假设和行动项。支持拖入 PDF、本地缓存和 JSON 备份。
                  </p>

                  <div className="control-panel__actions">
                    <button type="button" className="primary" onClick={addNote}>
                      新建笔记卡
                    </button>
                    <button type="button" className="secondary" onClick={() => pdfInputRef.current?.click()}>
                      导入 PDF
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => arrangeHierarchy('horizontal')}
                    >
                      横向整理
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => arrangeHierarchy('vertical')}
                    >
                      纵向整理
                    </button>
                    <button type="button" className="secondary" onClick={exportWorkspace}>
                      导出脑图
                    </button>
                    <button type="button" className="secondary" onClick={() => importRef.current?.click()}>
                      导入脑图
                    </button>
                    <button type="button" className="danger" onClick={() => void resetWorkspace()}>
                      重置画布
                    </button>
                  </div>

                  <div className="control-panel__meta">
                    <span>{noteCount} 篇笔记</span>
                    <span>{pdfCount} 个PDF </span>
                    <span>{edges.length} 条关系线</span>
                  </div>

                  <section className="control-panel__section">
                    <div className="nav-panel__header">
                      <div>
                        <h2>导航栏</h2>
                        <p>按连线层级浏览节点，也可以一键回到全图视角。</p>
                      </div>
                      <button
                        type="button"
                        className="secondary nav-panel__toggle"
                        onClick={() => setIsNavOpen((current) => !current)}
                      >
                        {isNavOpen ? '收起' : '展开'}
                      </button>
                    </div>

                    {isNavOpen ? (
                      <div className="nav-panel__body">
                        <div className="nav-panel__actions">
                          <button type="button" className="secondary" onClick={focusOverview}>
                            查看全图
                          </button>
                        </div>

                        {navTree.length ? (
                          <div className="nav-panel__tree">
                            {navTree.map((node) => (
                              <NavTreeItem
                                key={node.id}
                                item={node}
                                depth={0}
                                collapsedIds={collapsedNavIds}
                                onToggle={toggleNavBranch}
                                onFocus={focusNode}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="nav-panel__empty">当前还没有节点，先创建一张卡片再导航。</p>
                        )}
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}
            </section>
          </Panel>

          <Panel position="top-right">
            <aside className={`hint-panel${isHintPanelOpen ? '' : ' hint-panel--collapsed'}`}>
              <div className="hint-panel__header">
                <h2>使用方式</h2>
                <button
                  type="button"
                  className="secondary panel-toggle"
                  onClick={() => setIsHintPanelOpen((current) => !current)}
                >
                  {isHintPanelOpen ? '收起' : '展开'}
                </button>
              </div>

              {isHintPanelOpen ? (
                <>
                  <p>拖动画布可无限平移，滚轮缩放，拖拽节点上下手柄可以建立结构关系。</p>
                  <p>卡片右上角支持收起或展开，左上角导航栏支持按层级快速定位到任意节点。</p>
                  <p>直接把 PDF 从系统文件夹拖进来，会自动生成带预览和摘要输入区的文档卡片。</p>
                </>
              ) : null}
            </aside>
          </Panel>
        </ReactFlow>

        {!isReady ? <div className="loading-screen">正在恢复你的知识画布...</div> : null}
      </div>
    </CanvasContext.Provider>
  )
}

function cloneCanvasHistoryState(state: CanvasHistoryState): CanvasHistoryState {
  return {
    nodes: state.nodes.map((node) => structuredClone(node)),
    edges: state.edges.map((edge) => structuredClone(edge)),
    pdfFiles: { ...state.pdfFiles },
  }
}

function pushHistoryEntry(historyStack: CanvasHistoryState[], historyState: CanvasHistoryState) {
  const nextStack = historyStack.concat(cloneCanvasHistoryState(historyState))

  if (nextStack.length > MAX_HISTORY_ENTRIES) {
    nextStack.shift()
  }

  return nextStack
}

function shouldTrackNodeChanges(changes: NodeChange<MindNode>[]) {
  return changes.some((change) => {
    if (change.type === 'position') {
      return change.dragging === false
    }

    return change.type === 'add' || change.type === 'remove' || change.type === 'replace'
  })
}

function shouldTrackEdgeChanges(changes: EdgeChange<MindEdge>[]) {
  return changes.some((change) => change.type !== 'select')
}

function dropPdfFilesForRemovedNodes(
  nodes: MindNode[],
  pdfFiles: Record<string, Blob>,
  removedNodeIds: Set<string>,
) {
  const removedFileIds = nodes
    .filter(
      (node): node is Extract<MindNode, { type: 'pdf' }> =>
        removedNodeIds.has(node.id) && node.type === 'pdf' && node.data.kind === 'pdf',
    )
    .map((node) => node.data.fileId)

  if (!removedFileIds.length) {
    return pdfFiles
  }

  const nextPdfFiles = { ...pdfFiles }

  for (const fileId of removedFileIds) {
    delete nextPdfFiles[fileId]
  }

  return nextPdfFiles
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  )
}

async function syncPdfFileStore(
  previousPdfFiles: Record<string, Blob>,
  nextPdfFiles: Record<string, Blob>,
) {
  const writeTasks = Object.entries(nextPdfFiles)
    .filter(([fileId, file]) => previousPdfFiles[fileId] !== file)
    .map(([fileId, file]) => savePdfFile(fileId, file))
  const removeTasks = Object.keys(previousPdfFiles)
    .filter((fileId) => !(fileId in nextPdfFiles))
    .map((fileId) => removePdfFile(fileId))

  if (!writeTasks.length && !removeTasks.length) {
    return
  }

  await Promise.all([...writeTasks, ...removeTasks])
}

function createNoteNode(position: XYPosition): MindNode {
  return {
    id: createId('note'),
    type: 'note',
    position,
    data: {
      kind: 'note',
      title: '新笔记',
      content: '',
      collapsed: false,
    },
  }
}

function createPdfNode(position: XYPosition, title: string, fileId: string): MindNode {
  return {
    id: createId('pdf-node'),
    type: 'pdf',
    position,
    data: {
      kind: 'pdf',
      title,
      summary: '',
      fileId,
      collapsed: false,
    },
  }
}

function createMindEdge(source: string, target: string): MindEdge {
  return {
    ...defaultEdgeOptions,
    id: createId('edge'),
    source,
    target,
  }
}

function hasRelation(edges: MindEdge[], source: string, target: string) {
  return edges.some((edge) => edge.source === source && edge.target === target)
}

function buildNavigationTree(nodes: MindNode[], edges: MindEdge[]): NavTreeNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const incomingCounts = new Map<string, number>()
  const childrenById = new Map<string, string[]>()

  for (const node of nodes) {
    incomingCounts.set(node.id, 0)
    childrenById.set(node.id, [])
  }

  for (const edge of edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target) || edge.source === edge.target) {
      continue
    }

    childrenById.get(edge.source)!.push(edge.target)
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1)
  }

  const sortNodeIds = (ids: string[]) =>
    [...new Set(ids)].sort((leftId, rightId) => {
      const leftNode = nodesById.get(leftId)
      const rightNode = nodesById.get(rightId)

      if (!leftNode || !rightNode) {
        return 0
      }

      return compareNodesForNavigation(leftNode, rightNode)
    })

  const candidateRoots = sortNodeIds(
    nodes.map((node) => node.id).filter((nodeId) => (incomingCounts.get(nodeId) ?? 0) === 0),
  )
  const roots = candidateRoots.length ? candidateRoots : sortNodeIds(nodes.map((node) => node.id))
  const visited = new Set<string>()
  const tree: NavTreeNode[] = []

  function walk(nodeId: string, trail: Set<string>): NavTreeNode | null {
    const node = nodesById.get(nodeId)

    if (!node || visited.has(nodeId) || trail.has(nodeId)) {
      return null
    }

    visited.add(nodeId)

    const nextTrail = new Set(trail)
    nextTrail.add(nodeId)

    const children = sortNodeIds(childrenById.get(nodeId) ?? [])
      .map((childId) => walk(childId, nextTrail))
      .filter((child): child is NavTreeNode => Boolean(child))

    return {
      id: node.id,
      label: getNodeLabel(node),
      kind: node.type === 'pdf' ? 'PDF' : 'NOTE',
      children,
    }
  }

  for (const rootId of roots) {
    const branch = walk(rootId, new Set<string>())

    if (branch) {
      tree.push(branch)
    }
  }

  for (const nodeId of sortNodeIds(nodes.map((node) => node.id))) {
    if (visited.has(nodeId)) {
      continue
    }

    const branch = walk(nodeId, new Set<string>())

    if (branch) {
      tree.push(branch)
    }
  }

  return tree
}

function arrangeNodesByHierarchy(nodes: MindNode[], edges: MindEdge[], mode: LayoutMode) {
  if (nodes.length < 2) {
    return nodes
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const validEdges = edges.filter(
    (edge) => nodesById.has(edge.source) && nodesById.has(edge.target) && edge.source !== edge.target,
  )

  if (!validEdges.length) {
    return arrangeNodesWithoutEdges(nodes, mode)
  }

  const config = getLayoutConfig(mode)

  const incomingCounts = new Map<string, number>()
  const pendingIncomingCounts = new Map<string, number>()
  const childrenById = new Map<string, string[]>()
  const parentsById = new Map<string, string[]>()

  for (const node of nodes) {
    incomingCounts.set(node.id, 0)
    pendingIncomingCounts.set(node.id, 0)
    childrenById.set(node.id, [])
    parentsById.set(node.id, [])
  }

  for (const edge of validEdges) {
    childrenById.get(edge.source)!.push(edge.target)
    parentsById.get(edge.target)!.push(edge.source)
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1)
    pendingIncomingCounts.set(edge.target, (pendingIncomingCounts.get(edge.target) ?? 0) + 1)
  }

  const sortNodeIds = (ids: string[]) =>
    [...new Set(ids)].sort((leftId, rightId) => {
      const leftNode = nodesById.get(leftId)
      const rightNode = nodesById.get(rightId)

      if (!leftNode || !rightNode) {
        return 0
      }

      return compareNodesForLayout(leftNode, rightNode, mode)
    })

  const roots = sortNodeIds(
    nodes.map((node) => node.id).filter((nodeId) => (incomingCounts.get(nodeId) ?? 0) === 0),
  )
  const queue = roots.length ? [...roots] : sortNodeIds(nodes.map((node) => node.id))
  const depthById = new Map<string, number>()
  const visited = new Set<string>()

  for (const rootId of queue) {
    depthById.set(rootId, depthById.get(rootId) ?? 0)
  }

  while (queue.length) {
    const nodeId = queue.shift()!
    const currentDepth = depthById.get(nodeId) ?? 0

    if (visited.has(nodeId)) {
      continue
    }

    visited.add(nodeId)

    for (const childId of sortNodeIds(childrenById.get(nodeId) ?? [])) {
      depthById.set(childId, Math.max(depthById.get(childId) ?? 0, currentDepth + 1))
      pendingIncomingCounts.set(childId, Math.max((pendingIncomingCounts.get(childId) ?? 1) - 1, 0))

      if ((pendingIncomingCounts.get(childId) ?? 0) === 0) {
        queue.push(childId)
      }
    }
  }

  for (const nodeId of sortNodeIds(nodes.map((node) => node.id))) {
    if (depthById.has(nodeId)) {
      continue
    }

    const parentDepth = Math.max(
      -1,
      ...(parentsById.get(nodeId) ?? []).map((parentId) => depthById.get(parentId) ?? -1),
    )

    depthById.set(nodeId, parentDepth + 1)
  }

  const levels = new Map<number, string[]>()

  for (const node of nodes) {
    const depth = depthById.get(node.id) ?? 0
    const peers = levels.get(depth) ?? []
    peers.push(node.id)
    levels.set(depth, peers)
  }

  const orderedDepths = [...levels.keys()].sort((left, right) => left - right)
  const bounds = getNodePositionBounds(nodes)
  const preparedLevels = orderedDepths.map((depth) => {
    const ids = sortLevelNodeIds(levels.get(depth) ?? [], nodesById, parentsById, mode)
    const frames = ids.map((nodeId) => estimateNodeFrame(nodesById.get(nodeId)!))
    const mainSpan = Math.max(...frames.map((frame) => frame[config.mainSize]), 0)
    const crossSpans = frames.map((frame) => frame[config.crossSize])
    const totalCrossSpan =
      crossSpans.reduce((sum, span) => sum + span, 0) +
      config.itemGap * Math.max(crossSpans.length - 1, 0)

    return {
      ids,
      frames,
      mainSpan,
      crossSpans,
      totalCrossSpan,
    }
  })
  const totalMainSpan =
    preparedLevels.reduce((sum, level) => sum + level.mainSpan, 0) +
    config.levelGap * Math.max(preparedLevels.length - 1, 0)
  let mainCursor = getLayoutAxisCenter(bounds, mode) - totalMainSpan / 2
  const nextPositions = new Map<string, { x: number; y: number }>()

  for (const level of preparedLevels) {
    let crossCursor = getCrossAxisCenter(bounds, mode) - level.totalCrossSpan / 2

    level.ids.forEach((nodeId, index) => {
      const node = nodesById.get(nodeId)
      const frame = level.frames[index]

      if (!node || !frame) {
        return
      }

      const mainOffset = (level.mainSpan - frame[config.mainSize]) / 2

      nextPositions.set(nodeId, {
        x: mode === 'horizontal' ? mainCursor + mainOffset : crossCursor,
        y: mode === 'horizontal' ? crossCursor : mainCursor + mainOffset,
      })

      crossCursor += level.crossSpans[index] + config.itemGap
    })

    mainCursor += level.mainSpan + config.levelGap
  }

  return nodes.map((node) => ({
    ...node,
    position: nextPositions.get(node.id) ?? node.position,
  }))
}

function sortLevelNodeIds(
  ids: string[],
  nodesById: Map<string, MindNode>,
  parentsById: Map<string, string[]>,
  mode: LayoutMode,
) {
  return [...new Set(ids)].sort((leftId, rightId) => {
    const leftNode = nodesById.get(leftId)
    const rightNode = nodesById.get(rightId)

    if (!leftNode || !rightNode) {
      return 0
    }

    const leftAnchor = getParentAnchor(leftId, nodesById, parentsById, mode)
    const rightAnchor = getParentAnchor(rightId, nodesById, parentsById, mode)

    if (leftAnchor !== rightAnchor) {
      return leftAnchor - rightAnchor
    }

    return compareNodesForLayout(leftNode, rightNode, mode)
  })
}

function getParentAnchor(
  nodeId: string,
  nodesById: Map<string, MindNode>,
  parentsById: Map<string, string[]>,
  mode: LayoutMode,
) {
  const anchorKey = mode === 'horizontal' ? 'y' : 'x'
  const parents = parentsById.get(nodeId) ?? []

  if (!parents.length) {
    return nodesById.get(nodeId)?.position[anchorKey] ?? 0
  }

  const anchors = parents
    .map((parentId) => nodesById.get(parentId)?.position[anchorKey])
    .filter((anchor): anchor is number => typeof anchor === 'number')

  if (!anchors.length) {
    return nodesById.get(nodeId)?.position[anchorKey] ?? 0
  }

  return anchors.reduce((sum, anchor) => sum + anchor, 0) / anchors.length
}

function arrangeNodesWithoutEdges(nodes: MindNode[], mode: LayoutMode) {
  const config = getLayoutConfig(mode)
  const orderedNodes = [...nodes].sort((left, right) => compareNodesForLayout(left, right, mode))
  const bounds = getNodePositionBounds(nodes)
  const groupCount = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const groups = Array.from({ length: groupCount }, () => [] as MindNode[])

  orderedNodes.forEach((node, index) => {
    groups[index % groupCount].push(node)
  })

  const preparedGroups = groups.map((group) => {
    const frames = group.map((node) => estimateNodeFrame(node))
    const mainSpan = Math.max(...frames.map((frame) => frame[config.mainSize]), 0)
    const crossSpans = frames.map((frame) => frame[config.crossSize])
    const totalCrossSpan =
      crossSpans.reduce((sum, span) => sum + span, 0) +
      config.itemGap * Math.max(crossSpans.length - 1, 0)

    return {
      group,
      frames,
      mainSpan,
      crossSpans,
      totalCrossSpan,
    }
  })
  const totalMainSpan =
    preparedGroups.reduce((sum, group) => sum + group.mainSpan, 0) +
    config.levelGap * Math.max(preparedGroups.length - 1, 0)
  let mainCursor = getLayoutAxisCenter(bounds, mode) - totalMainSpan / 2

  const nextPositions = new Map<string, { x: number; y: number }>()

  preparedGroups.forEach((group) => {
    let crossCursor = getCrossAxisCenter(bounds, mode) - group.totalCrossSpan / 2

    group.group.forEach((node, index) => {
      const frame = group.frames[index]

      if (!frame) {
        return
      }

      const mainOffset = (group.mainSpan - frame[config.mainSize]) / 2

      nextPositions.set(node.id, {
        x: mode === 'horizontal' ? mainCursor + mainOffset : crossCursor,
        y: mode === 'horizontal' ? crossCursor : mainCursor + mainOffset,
      })

      crossCursor += group.crossSpans[index] + config.itemGap
    })

    mainCursor += group.mainSpan + config.levelGap
  })

  return nodes.map((node) => ({
    ...node,
    position: nextPositions.get(node.id) ?? node.position,
  }))
}

function getLayoutConfig(mode: LayoutMode) {
  if (mode === 'vertical') {
    return {
      mainSize: 'height' as const,
      crossSize: 'width' as const,
      levelGap: 76,
      itemGap: 30,
    }
  }

  return {
    mainSize: 'width' as const,
    crossSize: 'height' as const,
    levelGap: 80,
    itemGap: 30,
  }
}

function getLayoutAxisCenter(bounds: ReturnType<typeof getNodePositionBounds>, mode: LayoutMode) {
  return mode === 'horizontal' ? bounds.centerX : bounds.centerY
}

function getCrossAxisCenter(bounds: ReturnType<typeof getNodePositionBounds>, mode: LayoutMode) {
  return mode === 'horizontal' ? bounds.centerY : bounds.centerX
}

function compareNodesForLayout(left: MindNode, right: MindNode, mode: LayoutMode) {
  if (mode === 'vertical') {
    if (left.position.x !== right.position.x) {
      return left.position.x - right.position.x
    }

    if (left.position.y !== right.position.y) {
      return left.position.y - right.position.y
    }

    return getNodeLabel(left).localeCompare(getNodeLabel(right), 'zh-CN')
  }

  return compareNodesForNavigation(left, right)
}

function estimateNodeFrame(node: MindNode) {
  return {
    width: node.type === 'pdf' ? 340 : 320,
    height: node.data.collapsed ? 108 : node.type === 'pdf' ? 440 : 280,
  }
}

function getNodePositionBounds(nodes: MindNode[]) {
  const xs = nodes.map((node) => node.position.x)
  const ys = nodes.map((node) => node.position.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

function compareNodesForNavigation(left: MindNode, right: MindNode) {
  if (left.position.y !== right.position.y) {
    return left.position.y - right.position.y
  }

  if (left.position.x !== right.position.x) {
    return left.position.x - right.position.x
  }

  return getNodeLabel(left).localeCompare(getNodeLabel(right), 'zh-CN')
}

function getNodeLabel(node: MindNode) {
  const title = node.data.title.trim()

  if (title) {
    return title
  }

  return node.type === 'pdf' ? '未命名 PDF' : '未命名笔记'
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function isExportBundle(value: unknown): value is ExportBundle {
  if (!value || typeof value !== 'object') {
    return false
  }

  const bundle = value as Partial<ExportBundle>

  return (
    bundle.version === 1 &&
    typeof bundle.exportedAt === 'string' &&
    Boolean(bundle.snapshot) &&
    Boolean(bundle.pdfFiles)
  )
}

export default App
