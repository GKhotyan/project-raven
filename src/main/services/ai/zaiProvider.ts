import type OpenAI from 'openai';
import type { AIContentPart, AIProviderName } from './types';
import { ZAI_BASE_URL, buildZaiThinkingParams, zaiModelAcceptsImages } from './types';
import { OpenAIProvider } from './openaiProvider';

const IMAGE_OMITTED_NOTE = '[Screenshot omitted: this model cannot read images.]';

/**
 * Z.ai speaks OpenAI Chat Completions at its own base URL. Differences
 * from OpenAI: the legacy `max_tokens`, `thinking: { type }` instead of
 * `reasoning_effort`, and only GLM-5V accepts image parts.
 */
export class ZaiProvider extends OpenAIProvider {
  override readonly name: AIProviderName = 'zai';

  protected override async createClient(): Promise<OpenAI> {
    const OpenAI = (await import('openai')).default;
    return new OpenAI({ apiKey: this.apiKey, baseURL: ZAI_BASE_URL });
  }

  protected override tokenLimitParams(maxTokens: number): Record<string, unknown> {
    return { max_tokens: maxTokens };
  }

  protected override effortParams(): Record<string, unknown> {
    return buildZaiThinkingParams(this.model, this.effort);
  }

  protected override convertContent(content: string | AIContentPart[]) {
    if (typeof content === 'string' || zaiModelAcceptsImages(this.model)) {
      return super.convertContent(content);
    }
    // Text-only GLM models 400 on image_url parts. Keep the turn, drop the pixels.
    return content
      .map((part) => (part.type === 'text' ? part.text : IMAGE_OMITTED_NOTE))
      .join('\n');
  }
}
