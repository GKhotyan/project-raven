import type OpenAI from 'openai';
import type { AIContentPart, AIProviderName } from './types';
import { normalizeGemma4BaseUrl } from './gemma4Url';
import { OpenAIProvider } from './openaiProvider';


/** Internal Gemma gateway currently documents non-streaming Chat Completions. */
export class LocalGptProvider extends OpenAIProvider {
  override readonly name: AIProviderName = 'local-gpt';
  protected override streamResponses = false;

  constructor(apiKey: string, model: string, effort?: string, baseURL?: string) {
    super(apiKey, model, effort, baseURL);
  }

  protected override async createClient(): Promise<OpenAI> {
    const OpenAI = (await import('openai')).default;
    if (!this.baseURL) throw new Error('Enter the Gemma 4 API URL in Settings.');
    return new OpenAI({ apiKey: this.apiKey, baseURL: normalizeGemma4BaseUrl(this.baseURL), timeout: 120_000, maxRetries: 0 });
  }

  protected override tokenLimitParams(maxTokens: number): Record<string, unknown> {
    return { max_tokens: maxTokens };
  }

  protected override shortTokenLimitParams(maxTokens?: number): Record<string, unknown> {
    return this.tokenLimitParams(maxTokens ?? 8_192);
  }

  protected override effortParams(): Record<string, unknown> {
    return { use_tools: 'never', stream: false };
  }

  protected override convertContent(content: string | AIContentPart[]): string {
    if (typeof content === 'string') return content;
    return content.map((part) => part.type === 'text' ? part.text : '[Screenshot omitted: this model cannot read images.]').join('\n');
  }
}
