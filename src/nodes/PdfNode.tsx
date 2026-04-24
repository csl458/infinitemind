import { Document, Page, pdfjs } from 'react-pdf'
import { Handle, Position, type NodeProps } from '@xyflow/react'

import { useCanvasContext } from '../canvas-context'
import type { PdfCanvasNode } from '../types'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function PdfNode({ id, data, selected }: NodeProps<PdfCanvasNode>) {
  const { getPdfFile, removeNode, updatePdfNode } = useCanvasContext()
  const file = getPdfFile(data.fileId)
  const isCollapsed = data.collapsed ?? false

  return (
    <article
      className={`brain-node brain-node--pdf${selected ? ' is-selected' : ''}${isCollapsed ? ' brain-node--collapsed' : ''}`}
    >
      <Handle className="brain-node__handle" type="target" position={Position.Top} />

      <div className="brain-node__bar">
        <span className="brain-node__eyebrow">PDF Capsule</span>
        <div className="brain-node__actions">
          <button
            type="button"
            className="brain-node__icon brain-node__toggle nodrag"
            onClick={() => updatePdfNode(id, { collapsed: !isCollapsed })}
            aria-label={isCollapsed ? 'Expand PDF node' : 'Collapse PDF node'}
          >
            {isCollapsed ? '展开' : '收起'}
          </button>
          <button
            type="button"
            className="brain-node__icon nodrag"
            onClick={() => removeNode(id)}
            aria-label="Delete PDF node"
          >
            ×
          </button>
        </div>
      </div>

      <input
        className="brain-node__title nodrag"
        value={data.title}
        placeholder="PDF 标题"
        onChange={(event) => updatePdfNode(id, { title: event.target.value })}
      />

      {isCollapsed ? null : (
        <>
          <div className="brain-node__pdf nodrag">
            {file ? (
              <Document
                file={file}
                loading={<div className="brain-node__pdf-state">PDF 载入中...</div>}
                error={<div className="brain-node__pdf-state">无法解析这个 PDF。</div>}
              >
                <Page
                  pageNumber={1}
                  width={296}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
              </Document>
            ) : (
              <div className="brain-node__pdf-state">找不到本地 PDF 文件，重新导入即可恢复预览。</div>
            )}
          </div>

          <textarea
            className="brain-node__body brain-node__body--compact nodrag"
            value={data.summary}
            placeholder="在这里写摘要、启发、争议点和后续行动。"
            onChange={(event) => updatePdfNode(id, { summary: event.target.value })}
          />
        </>
      )}

      <Handle className="brain-node__handle" type="source" position={Position.Bottom} />
    </article>
  )
}

export default PdfNode