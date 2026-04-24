import { Handle, Position, type NodeProps } from '@xyflow/react'

import { useCanvasContext } from '../canvas-context'
import type { NoteCanvasNode } from '../types'

function NoteNode({ id, data, selected }: NodeProps<NoteCanvasNode>) {
  const { removeNode, updateNoteNode } = useCanvasContext()
  const isCollapsed = data.collapsed ?? false

  return (
    <article
      className={`brain-node brain-node--note${selected ? ' is-selected' : ''}${isCollapsed ? ' brain-node--collapsed' : ''}`}
    >
      <Handle className="brain-node__handle" type="target" position={Position.Top} />

      <div className="brain-node__bar">
        <span className="brain-node__eyebrow">Summary Card</span>
        <div className="brain-node__actions">
          <button
            type="button"
            className="brain-node__icon brain-node__toggle nodrag"
            onClick={() => updateNoteNode(id, { collapsed: !isCollapsed })}
            aria-label={isCollapsed ? 'Expand note' : 'Collapse note'}
          >
            {isCollapsed ? '展开' : '收起'}
          </button>
          <button
            type="button"
            className="brain-node__icon nodrag"
            onClick={() => removeNode(id)}
            aria-label="Delete note"
          >
            ×
          </button>
        </div>
      </div>

      <input
        className="brain-node__title nodrag"
        value={data.title}
        placeholder="节点标题"
        onChange={(event) => updateNoteNode(id, { title: event.target.value })}
      />

      {isCollapsed ? null : (
        <textarea
          className="brain-node__body nodrag"
          value={data.content}
          placeholder="写下你的理解、推导、反驳点或下一步实验。"
          onChange={(event) => updateNoteNode(id, { content: event.target.value })}
        />
      )}

      <Handle className="brain-node__handle" type="source" position={Position.Bottom} />
    </article>
  )
}

export default NoteNode