const ACCEPTED = new Set(['image/png', 'image/jpeg'])

/**
 * First PNG/JPEG file in a clipboard or drop item list. Returns null for
 * text so a normal Cmd+V into the input keeps working.
 */
export function imageFromItems(
  items: Array<{ kind: string; type: string; getAsFile(): File | null }>,
): File | null {
  for (const it of items) {
    if (it.kind === 'file' && ACCEPTED.has(it.type)) {
      const f = it.getAsFile()
      if (f) return f
    }
  }
  return null
}

export async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}
