import { Handle, Position, type NodeProps } from '@xyflow/react'

import { useCanvasContext } from '../canvas-context'
import type { NoteCanvasNode } from '../types'
import { useImeSafeField } from '../use-ime-safe-field'

function NoteNode({ id, data, selected }: NodeProps<NoteCanvasNode>) {
  const { removeNode, updateNoteNode } = useCanvasContext()
  const isCollapsed = data.collapsed ?? false
  const titleField = useImeSafeField(data.title, (nextValue) => updateNoteNode(id, { title: nextValue }))
  const contentField = useImeSafeField(data.content, (nextValue) =>
    updateNoteNode(id, { content: nextValue }),
  )

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
        className="brain-node__title nodrag nowheel"
        value={titleField.value}
        placeholder="节点标题"
        onChange={titleField.onChange}
        onCompositionStart={titleField.onCompositionStart}
        onCompositionEnd={titleField.onCompositionEnd}
        onBlur={titleField.onBlur}
      />

      {isCollapsed ? null : (
        <textarea
          className="brain-node__body nodrag nowheel"
          value={contentField.value}
          placeholder="写下你的理解、推导、反驳点或下一步实验。"
          onChange={contentField.onChange}
          onCompositionStart={contentField.onCompositionStart}
          onCompositionEnd={contentField.onCompositionEnd}
          onBlur={contentField.onBlur}
        />
      )}

      <Handle className="brain-node__handle" type="source" position={Position.Bottom} />
    </article>
  )
}

export default NoteNode