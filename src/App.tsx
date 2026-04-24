import {
  addEdge,
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
  type Edge,
  type XYPosition,
} from '@xyflow/react'
import { startTransition, useEffect, useRef, useState } from 'react'

import '@xyflow/react/dist/style.css'

import { CanvasContext } from './canvas-context'
import NoteNode from './nodes/NoteNode'
import PdfNode from './nodes/PdfNode'
import {
  clearWorkspaceStorage,
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
  const [nodes, setNodes, onNodesChange] = useNodesState<MindNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<MindEdge>([])
  const [pdfFiles, setPdfFiles] = useState<Record<string, Blob>>({})
  const [isReady, setIsReady] = useState(false)
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(true)
  const [isHintPanelOpen, setIsHintPanelOpen] = useState(true)
  const [isNavOpen, setIsNavOpen] = useState(true)
  const [collapsedNavIds, setCollapsedNavIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const snapshot = await loadSnapshot()

      if (!snapshot) {
        if (!cancelled) {
          startTransition(() => {
            setNodes(starterSnapshot.nodes)
            setEdges(starterSnapshot.edges)
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

      startTransition(() => {
        setNodes(snapshot.nodes)
        setEdges(snapshot.edges)
        setPdfFiles(restoredPdfFiles)
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

  function getViewportSpawn(offset = 0): XYPosition {
    return reactFlow.screenToFlowPosition({
      x: window.innerWidth / 2 + offset * 28,
      y: 220 + offset * 24,
    })
  }

  function addNote() {
    const node = createNoteNode(getViewportSpawn(nodes.length % 4))
    setNodes((current) => current.concat(node))
  }

  async function addPdfFiles(files: File[], anchor?: XYPosition) {
    const incomingFiles = files.filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    )

    if (!incomingFiles.length) {
      return
    }

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

    await Promise.all(
      Object.entries(nextPdfFiles).map(([fileId, file]) => savePdfFile(fileId, file)),
    )

    setPdfFiles((current) => ({ ...current, ...nextPdfFiles }))
    setNodes((current) => current.concat(nextNodes))
  }

  function updateNoteNode(id: string, patch: Partial<NoteNodeData>) {
    setNodes((current) =>
      current.map((node) => {
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
    )
  }

  function updatePdfNode(id: string, patch: Partial<PdfNodeData>) {
    setNodes((current) =>
      current.map((node) => {
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
    )
  }

  function getPdfFile(fileId: string) {
    return pdfFiles[fileId] ?? null
  }

  function removeNode(nodeId: string) {
    let removedFileId: string | null = null

    setNodes((current) =>
      current.filter((node) => {
        if (node.id === nodeId && node.type === 'pdf' && node.data.kind === 'pdf') {
          removedFileId = node.data.fileId
        }

        return node.id !== nodeId
      }),
    )

    setEdges((current) =>
      current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    )

    if (!removedFileId) {
      return
    }

    setPdfFiles((current) => {
      const next = { ...current }
      delete next[removedFileId!]
      return next
    })

    void removePdfFile(removedFileId)
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return
    }

    setEdges((current) =>
      hasRelation(current, connection.source!, connection.target!)
        ? current
        : addEdge(createMindEdge(connection.source!, connection.target!), current),
    )
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

  function toggleNavBranch(nodeId: string) {
    setCollapsedNavIds((current) => ({
      ...current,
      [nodeId]: !current[nodeId],
    }))
  }

  function onPdfInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    void addPdfFiles(files)
    event.target.value = ''
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const droppedFiles = Array.from(event.dataTransfer.files)

    void addPdfFiles(
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

      await Promise.all(
        Object.entries(restoredPdfFiles).map(([fileId, blob]) => savePdfFile(fileId, blob)),
      )
      await saveSnapshot(parsed.snapshot)

      startTransition(() => {
        setNodes(parsed.snapshot.nodes)
        setEdges(parsed.snapshot.edges)
        setPdfFiles(restoredPdfFiles)
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

    await clearWorkspaceStorage()

    startTransition(() => {
      setNodes(starterSnapshot.nodes)
      setEdges(starterSnapshot.edges)
      setPdfFiles({})
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
