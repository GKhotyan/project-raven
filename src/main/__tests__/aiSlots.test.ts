import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  MEMORY_MODELS,
  NOTES_FAST_MODELS,
  PROVIDER_API_KEY_FIELD,
  PROVIDER_LABELS,
  notesSlotIsExplicit,
  parseAIProviderName,
  resolveMemoryModel,
  resolveMemoryProvider,
  resolveNotesModel,
  resolveNotesProvider,
  resolveSettingsPickerEffort,
  resolveSettingsPickerModel,
} from '../../shared/aiSlots'

const ANTHROPIC_CATALOG = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5']
const OPENAI_CATALOG = ['gpt-5.6-luna', 'gpt-5.2']

describe('aiSlots', () => {
  it('parseAIProviderName accepts the four supported providers', () => {
    expect(parseAIProviderName('anthropic')).toBe('anthropic')
    expect(parseAIProviderName('openai')).toBe('openai')
    expect(parseAIProviderName('zai')).toBe('zai')
    expect(parseAIProviderName('local-gpt')).toBe('local-gpt')
    expect(parseAIProviderName('gemini')).toBeNull()
    expect(parseAIProviderName('')).toBeNull()
    expect(parseAIProviderName(undefined)).toBeNull()
  })

  it('maps every provider to a label and an API key field', () => {
    expect(AI_PROVIDERS).toEqual(['anthropic', 'openai', 'zai', 'local-gpt'])
    expect(PROVIDER_LABELS).toEqual({ anthropic: 'Anthropic', openai: 'OpenAI', zai: 'Z.ai', 'local-gpt': 'Gemma 4' })
    expect(PROVIDER_API_KEY_FIELD).toEqual({
      anthropic: 'anthropicApiKey',
      openai: 'openaiApiKey',
      zai: 'zaiApiKey',
      'local-gpt': 'localGptApiKey',
    })
  })

  it('resolveMemoryModel gives GLM-5.1 for zai', () => {
    expect(resolveMemoryProvider('zai')).toBe('zai')
    expect(resolveMemoryModel('zai')).toBe('glm-5.1')
  })

  it('resolveNotesProvider uses notesProvider when set, else aiProvider, else anthropic', () => {
    expect(resolveNotesProvider('openai', 'anthropic')).toBe('openai')
    expect(resolveNotesProvider('', 'openai')).toBe('openai')
    expect(resolveNotesProvider(undefined, undefined)).toBe('anthropic')
  })

  it('resolveNotesModel uses a catalog id and otherwise the cheap default', () => {
    expect(resolveNotesModel('anthropic', 'claude-sonnet-4-6', ANTHROPIC_CATALOG)).toBe('claude-sonnet-4-6')
    expect(resolveNotesModel('anthropic', '', ANTHROPIC_CATALOG)).toBe(NOTES_FAST_MODELS.anthropic)
    expect(resolveNotesModel('anthropic', 'gpt-5.2', ANTHROPIC_CATALOG)).toBe(NOTES_FAST_MODELS.anthropic)
    expect(resolveNotesModel('openai', undefined, OPENAI_CATALOG)).toBe(NOTES_FAST_MODELS.openai)
  })

  it('resolveSettingsPickerModel only allows Haiku / Luna', () => {
    expect(resolveSettingsPickerModel('anthropic', 'claude-sonnet-5')).toBe(NOTES_FAST_MODELS.anthropic)
    expect(resolveSettingsPickerModel('anthropic', 'claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(resolveSettingsPickerModel('openai', 'gpt-5.6-sol')).toBe(NOTES_FAST_MODELS.openai)
    expect(resolveSettingsPickerModel('openai', 'gpt-5.6-luna')).toBe('gpt-5.6-luna')
  })

  it('resolveSettingsPickerEffort defaults Z.ai notes to high and the others to low', () => {
    expect(resolveSettingsPickerEffort(undefined, 'zai')).toBe('high')
    expect(resolveSettingsPickerEffort('', 'zai')).toBe('high')
    expect(resolveSettingsPickerEffort('max', 'zai')).toBe('high')
    expect(resolveSettingsPickerEffort('low', 'zai')).toBe('low')
    expect(resolveSettingsPickerEffort(undefined, 'openai')).toBe('low')
    expect(resolveSettingsPickerEffort(undefined, 'anthropic')).toBe('low')
  })

  it('resolveSettingsPickerEffort keeps none/low/high and clamps everything else to low', () => {
    expect(resolveSettingsPickerEffort('none')).toBe('none')
    expect(resolveSettingsPickerEffort('low')).toBe('low')
    expect(resolveSettingsPickerEffort('high')).toBe('high')
    expect(resolveSettingsPickerEffort('max')).toBe('low')
    expect(resolveSettingsPickerEffort(undefined)).toBe('low')
  })

  it('notesSlotIsExplicit is true only when both provider and model are set', () => {
    expect(notesSlotIsExplicit('anthropic', 'claude-haiku-4-5')).toBe(true)
    expect(notesSlotIsExplicit('', 'claude-haiku-4-5')).toBe(false)
    expect(notesSlotIsExplicit('anthropic', '')).toBe(false)
    expect(notesSlotIsExplicit(undefined, undefined)).toBe(false)
  })

  it('resolveMemoryProvider follows Live assist, never notesProvider', () => {
    expect(resolveMemoryProvider('openai')).toBe('openai')
    expect(resolveMemoryProvider('anthropic')).toBe('anthropic')
    expect(resolveMemoryProvider('')).toBe('anthropic')
  })

  it('resolveMemoryModel is Sonnet 5 / Terra, not the notes cheap default', () => {
    expect(resolveMemoryModel('anthropic')).toBe('claude-sonnet-5')
    expect(resolveMemoryModel('openai')).toBe('gpt-5.6-terra')
    expect(MEMORY_MODELS.anthropic).not.toBe(NOTES_FAST_MODELS.anthropic)
    expect(MEMORY_MODELS.openai).not.toBe(NOTES_FAST_MODELS.openai)
  })
})
