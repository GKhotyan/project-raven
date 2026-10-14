import { AI_PROVIDERS, type AIProviderName } from '../../../shared/aiSlots'

export interface LlmKeyValidationPlan {
  primary: AIProviderName
  primaryKey: string
  extras?: { openaiKey?: string; zaiKey?: string }
}

/**
 * First filled key (Anthropic, OpenAI, Z.ai) is primary; the rest ride
 * along as extras so one cooldown-limited IPC call checks all of them.
 */
export function planLlmKeyValidation(keys: Record<AIProviderName, string>): LlmKeyValidationPlan | null {
  const trimmed: Record<AIProviderName, string> = {
    anthropic: keys.anthropic.trim(),
    openai: keys.openai.trim(),
    zai: keys.zai.trim(),
  }
  const primary = AI_PROVIDERS.find((p) => trimmed[p].length > 0)
  if (!primary) return null

  const extras: { openaiKey?: string; zaiKey?: string } = {}
  if (primary !== 'openai' && trimmed.openai) extras.openaiKey = trimmed.openai
  if (primary !== 'zai' && trimmed.zai) extras.zaiKey = trimmed.zai

  return {
    primary,
    primaryKey: trimmed[primary],
    ...(Object.keys(extras).length > 0 ? { extras } : {}),
  }
}
