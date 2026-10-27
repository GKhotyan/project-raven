/** Accept either an OpenAI API base URL or its full chat-completions endpoint. */
export function normalizeGemma4BaseUrl(value: string): string {
  const raw = value.trim().replace(/\/+$/, '')
  if (!raw) throw new Error('Enter the Gemma 4 API URL in Settings.')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Enter a valid Gemma 4 API URL.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Gemma 4 URL must be an HTTP(S) endpoint without credentials or query parameters.')
  }
  let base = url.toString().replace(/\/+$/, '')
  base = base.replace(/\/chat\/completions$/i, '')
  return base
}
