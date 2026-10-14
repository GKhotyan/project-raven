/**
 * Live assist vs notes vs system memory.
 *
 * Memory is not a Settings slot. A weak compact poisons Assist for the
 * rest of the session, so this is Sonnet-class, not Haiku/Luna. Still
 * hits the Live assist vendor's key:
 * Anthropic → Claude Sonnet 5, OpenAI → GPT-5.6 Terra, Z.ai → GLM-5.1.
 *
 * Unset notes* still defaults to the cheap models (Haiku / Luna).
 */

export type AIProviderName = 'anthropic' | 'openai' | 'zai'

/** Display and fallback order. Anthropic first: it is the app default. */
export const AI_PROVIDERS: readonly AIProviderName[] = ['anthropic', 'openai', 'zai']

export const PROVIDER_LABELS: Record<AIProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  zai: 'Z.ai',
}

export type AIProviderKeyField = 'anthropicApiKey' | 'openaiApiKey' | 'zaiApiKey'

/** Store field holding each vendor's key. Never fall back to another vendor's key. */
export const PROVIDER_API_KEY_FIELD: Record<AIProviderName, AIProviderKeyField> = {
  anthropic: 'anthropicApiKey',
  openai: 'openaiApiKey',
  zai: 'zaiApiKey',
}

export const NOTES_FAST_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.6-luna',
  zai: 'glm-5.3-flash',
}

/** System memory compact. Not user-configurable. Not the notes cheap default. */
export const MEMORY_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.6-terra',
  zai: 'glm-5.1',
}

export function parseAIProviderName(value: unknown): AIProviderName | null {
  return (AI_PROVIDERS as readonly unknown[]).includes(value) ? (value as AIProviderName) : null
}

/** notesProvider if set, else assist aiProvider, else Anthropic. */
export function resolveNotesProvider(notesProvider: unknown, aiProvider: unknown): AIProviderName {
  return parseAIProviderName(notesProvider) ?? parseAIProviderName(aiProvider) ?? 'anthropic'
}

/** Catalog id if the user picked a notes model; otherwise the cheap default. */
export function resolveNotesModel(
  provider: AIProviderName,
  notesModel: unknown,
  catalog: readonly string[],
): string {
  const requested = typeof notesModel === 'string' ? notesModel.trim() : ''
  if (requested && catalog.includes(requested)) return requested
  return NOTES_FAST_MODELS[provider]
}

export function notesSlotIsExplicit(notesProvider: unknown, notesModel: unknown): boolean {
  const model = typeof notesModel === 'string' ? notesModel.trim() : ''
  return parseAIProviderName(notesProvider) !== null && model.length > 0
}

/** Notes Settings picker. Live assist uses the full catalog. */
export function resolveSettingsPickerModel(
  provider: AIProviderName,
  requested: unknown,
): string {
  const id = typeof requested === 'string' ? requested.trim() : ''
  return id === NOTES_FAST_MODELS[provider] ? id : NOTES_FAST_MODELS[provider]
}

/**
 * Notes effort: none/low/high. `high` is for models that reason poorly at
 * low (GLM-5.3 Flash skips thinking there). Haiku has no effort API;
 * callers still store `low`.
 */
export function resolveSettingsPickerEffort(requested: unknown): 'none' | 'low' | 'high' {
  return requested === 'none' || requested === 'high' ? requested : 'low'
}

/** Live-assist vendor only. Ignores notesProvider / notesModel. */
export function resolveMemoryProvider(aiProvider: unknown): AIProviderName {
  return parseAIProviderName(aiProvider) ?? 'anthropic'
}

export function resolveMemoryModel(aiProvider: unknown): string {
  return MEMORY_MODELS[resolveMemoryProvider(aiProvider)]
}
