import { describe, expect, it } from 'vitest'
import { planLlmKeyValidation } from '../llmKeys'

describe('planLlmKeyValidation', () => {
  it('returns null when no LLM key is set', () => {
    expect(planLlmKeyValidation({ anthropic: ' ', openai: '', zai: '' })).toBeNull()
  })

  it('keeps Anthropic primary and sends the others as extras', () => {
    expect(planLlmKeyValidation({ anthropic: 'ant', openai: 'sk', zai: 'zai' })).toEqual({
      primary: 'anthropic',
      primaryKey: 'ant',
      extras: { openaiKey: 'sk', zaiKey: 'zai' },
    })
  })

  it('makes Z.ai primary when it is the only key, trimmed', () => {
    expect(planLlmKeyValidation({ anthropic: '', openai: '', zai: '  zai-key ' })).toEqual({
      primary: 'zai',
      primaryKey: 'zai-key',
    })
  })

  it('makes OpenAI primary and Z.ai secondary without Anthropic', () => {
    expect(planLlmKeyValidation({ anthropic: '', openai: 'sk', zai: 'zai' })).toEqual({
      primary: 'openai',
      primaryKey: 'sk',
      extras: { zaiKey: 'zai' },
    })
  })
})
