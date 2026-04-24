import localforage from 'localforage'

import type { ExportBundle, WorkspaceSnapshot } from './types'

const workspaceStore = localforage.createInstance({
  name: 'mind-brain',
  storeName: 'workspace',
})

const pdfStore = localforage.createInstance({
  name: 'mind-brain',
  storeName: 'pdf-files',
})

const SNAPSHOT_KEY = 'snapshot-v1'

export async function loadSnapshot() {
  return workspaceStore.getItem<WorkspaceSnapshot>(SNAPSHOT_KEY)
}

export async function saveSnapshot(snapshot: WorkspaceSnapshot) {
  await workspaceStore.setItem(SNAPSHOT_KEY, snapshot)
}

export async function savePdfFile(fileId: string, file: Blob) {
  await pdfStore.setItem(fileId, file)
}

export async function loadPdfFiles(fileIds: string[]) {
  const pairs = await Promise.all(
    fileIds.map(async (fileId) => {
      const file = await pdfStore.getItem<Blob>(fileId)
      return [fileId, file] as const
    }),
  )

  return Object.fromEntries(
    pairs.filter((entry): entry is readonly [string, Blob] => Boolean(entry[1])),
  )
}

export async function removePdfFile(fileId: string) {
  await pdfStore.removeItem(fileId)
}

export async function clearWorkspaceStorage() {
  await Promise.all([workspaceStore.clear(), pdfStore.clear()])
}

export async function createExportBundle(
  snapshot: WorkspaceSnapshot,
  pdfFiles: Record<string, Blob>,
): Promise<ExportBundle> {
  const encodedFiles = await Promise.all(
    Object.entries(pdfFiles).map(async ([fileId, file]) => {
      return [fileId, await blobToDataUrl(file)] as const
    }),
  )

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    snapshot,
    pdfFiles: Object.fromEntries(encodedFiles),
  }
}

export async function restorePdfFiles(bundle: ExportBundle) {
  const decodedEntries = await Promise.all(
    Object.entries(bundle.pdfFiles).map(async ([fileId, dataUrl]) => {
      return [fileId, await dataUrlToBlob(dataUrl)] as const
    }),
  )

  return Object.fromEntries(decodedEntries)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      resolve(String(reader.result))
    }

    reader.onerror = () => {
      reject(reader.error)
    }

    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  return response.blob()
}