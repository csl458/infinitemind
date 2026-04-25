import { Document, Page, pdfjs } from 'react-pdf'
import { Handle, Position, type NodeProps } from '@xyflow/react'

import { useCanvasContext } from '../canvas-context'
import type { PdfCanvasNode } from '../types'
import { useImeSafeField } from '../use-ime-safe-field'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function PdfNode({ id, data, selected }: NodeProps<PdfCanvasNode>) {
  const { getPdfFile, removeNode, updatePdfNode } = useCanvasContext()
  const file = getPdfFile(data.fileId)
  const isCollapsed = data.collapsed ?? false
  const titleField = useImeSafeField(data.title, (nextValue) => updatePdfNode(id, { title: nextValue }))
  const summaryField = useImeSafeField(data.summary, (nextValue) =>
    updatePdfNode(id, { summary: nextValue }),
  )

  function openPdfPreview() {
    if (!file) {
      return
    }

    const url = URL.createObjectURL(file)
    const link = document.createElement('a')

    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()

    window.setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 60_000)
  }

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
        className="brain-node__title nodrag nowheel"
        value={titleField.value}
        placeholder="PDF 标题"
        onChange={titleField.onChange}
        onCompositionStart={titleField.onCompositionStart}
        onCompositionEnd={titleField.onCompositionEnd}
        onBlur={titleField.onBlur}
      />

      {isCollapsed ? null : (
        <>
          <div
            className={`brain-node__pdf nodrag${file ? ' brain-node__pdf--clickable' : ''}`}
            role={file ? 'button' : undefined}
            tabIndex={file ? 0 : undefined}
            title={file ? '点击在新页面打开 PDF' : undefined}
            aria-label={file ? '在新页面打开 PDF' : undefined}
            onClick={file ? openPdfPreview : undefined}
            onKeyDown={
              file
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openPdfPreview()
                    }
                  }
                : undefined
            }
          >
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
            className="brain-node__body brain-node__body--compact nodrag nowheel"
            value={summaryField.value}
            placeholder="在这里写摘要、启发、争议点和后续行动。"
            onChange={summaryField.onChange}
            onCompositionStart={summaryField.onCompositionStart}
            onCompositionEnd={summaryField.onCompositionEnd}
            onBlur={summaryField.onBlur}
          />
        </>
      )}

      <Handle className="brain-node__handle" type="source" position={Position.Bottom} />
    </article>
  )
}

export default PdfNode