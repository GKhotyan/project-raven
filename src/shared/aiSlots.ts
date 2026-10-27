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

export type AIProviderName = 'anthropic' | 'openai' | 'zai' | 'local-gpt'

/** Display and fallback order. Anthropic first: it is the app default. */
export const AI_PROVIDERS: readonly AIProviderName[] = ['anthropic', 'openai', 'zai', 'local-gpt']

export const PROVIDER_LABELS: Record<AIProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  zai: 'Z.ai',
  'local-gpt': 'Gemma 4',
}

export type AIProviderKeyField = 'anthropicApiKey' | 'openaiApiKey' | 'zaiApiKey' | 'localGptApiKey'

/** Store field holding each vendor's key. Never fall back to another vendor's key. */
export const PROVIDER_API_KEY_FIELD: Record<AIProviderName, AIProviderKeyField> = {
  anthropic: 'anthropicApiKey',
  openai: 'openaiApiKey',
  zai: 'zaiApiKey',
  'local-gpt': 'localGptApiKey',
}

export const NOTES_FAST_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.6-luna',
  zai: 'glm-5.3-flash',
  'local-gpt': 'detmir-gpt',
}

/** System memory compact. Not user-configurable. Not the notes cheap default. */
export const MEMORY_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.6-terra',
  zai: 'glm-5.1',
  'local-gpt': 'detmir-gpt',
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

export type NotesEffort = 'none' | 'low' | 'high'

/**
 * Notes effort when none is stored. GLM-5.3 Flash skips reasoning at low and
 * gets facts wrong, so Z.ai notes think by default. Haiku has no effort API.
 */
export const NOTES_DEFAULT_EFFORT: Record<AIProviderName, NotesEffort> = {
  anthropic: 'low',
  openai: 'low',
  zai: 'high',
  'local-gpt': 'low',
}

/** Notes effort: none/low/high; anything else falls back to the vendor default. */
export function resolveSettingsPickerEffort(
  requested: unknown,
  provider: AIProviderName = 'anthropic',
): NotesEffort {
  return requested === 'none' || requested === 'low' || requested === 'high'
    ? requested
    : NOTES_DEFAULT_EFFORT[provider]
}

/** Live-assist vendor only. Ignores notesProvider / notesModel. */
export function resolveMemoryProvider(aiProvider: unknown): AIProviderName {
  return parseAIProviderName(aiProvider) ?? 'anthropic'
}

export function resolveMemoryModel(aiProvider: unknown): string {
  return MEMORY_MODELS[resolveMemoryProvider(aiProvider)]
}
