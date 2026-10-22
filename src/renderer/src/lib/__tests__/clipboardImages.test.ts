import { describe, expect, it } from 'vitest'
import { imageFromItems } from '../clipboardImages'

const file = (type: string) => ({ name: 'x', type }) as unknown as File
const item = (kind: string, type: string, f: File | null = file(type)) => ({ kind, type, getAsFile: () => f })

describe('imageFromItems', () => {
  it('picks the first PNG or JPEG file item', () => {
    const png = file('image/png')
    expect(imageFromItems([item('string', 'text/plain'), item('file', 'image/png', png)])).toBe(png)
    expect(imageFromItems([item('file', 'image/jpeg')])?.type).toBe('image/jpeg')
  })

  it('ignores plain text and other image types so normal paste keeps working', () => {
    expect(imageFromItems([item('string', 'text/plain')])).toBeNull()
    expect(imageFromItems([item('file', 'image/gif')])).toBeNull()
    expect(imageFromItems([])).toBeNull()
  })
})
