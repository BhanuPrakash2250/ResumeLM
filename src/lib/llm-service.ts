import { type LanguageModelV1, streamText, type CoreMessage, type ToolSet, wrapLanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';

export type LLMFallbackEvent = {
  provider: string;
  model: string;
  status: 'success' | 'failed';
  error?: string;
};

export type LLMRequestInput = {
  system?: string;
  prompt?: string;
  messages?: CoreMessage[];
  tools?: ToolSet;
  maxSteps?: number;
  temperature?: number;
};

type ProviderCandidate = {
  provider: string;
  model: string;
  createModel: () => LanguageModelV1 | null;
};

const LLM_REQUEST_TIMEOUT_MS = 30_000;

function redactDiagnostic(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (text || 'unknown')
    .replace(/(NVIDIA_API_KEY|GROQ_API_KEY|CLOUDFLARE_API_KEY|SUPABASE_SERVICE_ROLE_KEY|authorization|cookie)\s*[:=]\s*[^,\s}]+/gi, '$1=[REDACTED]')
    .slice(0, 4000);
}

function getProviderError(error: unknown): { name: string; status: string; message: string; responseBody: string; cause: string } {
  if (!error || typeof error !== 'object') {
    return { name: typeof error, status: 'unknown', message: 'Unknown provider failure', responseBody: 'unknown', cause: 'unknown' };
  }

  const providerError = error as {
    name?: string;
    statusCode?: number;
    status?: number;
    message?: string;
    responseBody?: string;
    cause?: unknown;
  };

  return {
    name: providerError.name ?? 'unknown',
    status: String(providerError.statusCode ?? providerError.status ?? 'unknown'),
    message: redactDiagnostic(providerError.message),
    responseBody: redactDiagnostic(providerError.responseBody),
    cause: redactDiagnostic(providerError.cause),
  };
}

function logProviderFailure(candidate: ProviderCandidate, error: unknown, duration: number): string {
  const diagnostic = getProviderError(error);
  console.warn('[LLM][FAIL]', {
    provider: candidate.provider,
    model: candidate.model,
    status: diagnostic.status,
    errorName: diagnostic.name,
    errorMessage: diagnostic.message,
    responseBody: diagnostic.responseBody,
    cause: diagnostic.cause,
    duration,
  });
  return `${candidate.provider}:${diagnostic.status}:${diagnostic.name} ${diagnostic.message}`;
}

function getEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getLLMProviderStatus() {
  return {
    nvidia: Boolean(getEnvValue('NVIDIA_API_KEY')),
    groq: Boolean(getEnvValue('GROQ_API_KEY')),
    cloudflare: Boolean(getEnvValue('CLOUDFLARE_ACCOUNT_ID') && getEnvValue('CLOUDFLARE_API_KEY')),
  };
}

function logRuntimeProviderStatus() {
  console.info('[AI][ENV]', {
    'NVIDIA configured': Boolean(getEnvValue('NVIDIA_API_KEY')),
    'GROQ configured': Boolean(getEnvValue('GROQ_API_KEY')),
    'CLOUDFLARE configured': Boolean(getEnvValue('CLOUDFLARE_API_KEY')),
    'CLOUDFLARE_ACCOUNT_ID configured': Boolean(getEnvValue('CLOUDFLARE_ACCOUNT_ID')),
  });
}

export function formatLLMProviderStatus(): string {
  const status = getLLMProviderStatus();
  return [
    `NVIDIA_API_KEY: ${status.nvidia ? 'configured' : 'missing'}`,
    `GROQ_API_KEY: ${status.groq ? 'configured' : 'missing'}`,
    `CLOUDFLARE_ACCOUNT_ID: ${getEnvValue('CLOUDFLARE_ACCOUNT_ID') ? 'configured' : 'missing'}`,
    `CLOUDFLARE_API_KEY: ${getEnvValue('CLOUDFLARE_API_KEY') ? 'configured' : 'missing'}`,
  ].join('\n');
}

function withRequestTimeout(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function getProviderCandidates(): ProviderCandidate[] {
  const nvidiaApiKey = getEnvValue('NVIDIA_API_KEY');
  const groqApiKey = getEnvValue('GROQ_API_KEY');
  const cloudflareAccountId = getEnvValue('CLOUDFLARE_ACCOUNT_ID');
  const cloudflareApiKey = getEnvValue('CLOUDFLARE_API_KEY');

  return [
  {
    provider: 'nvidia',
    model: getEnvValue('NVIDIA_MODEL') || 'nvidia/nemotron-3-super-120b-a12b',
    createModel: () => {
      if (!nvidiaApiKey) return null;
      return createOpenAI({
        apiKey: nvidiaApiKey,
        compatibility: 'strict',
        baseURL: 'https://integrate.api.nvidia.com/v1',
      })(getEnvValue('NVIDIA_MODEL') || 'nvidia/nemotron-3-super-120b-a12b') as LanguageModelV1;
    },
  },
  {
    provider: 'groq',
    model: getEnvValue('GROQ_MODEL') || "openai/gpt-oss-120b",
    createModel: () => {
      if (!groqApiKey) return null;
      return createGroq({ apiKey: groqApiKey })(getEnvValue('GROQ_MODEL') || "openai/gpt-oss-120b") as LanguageModelV1;
    },
  },
  {
    provider: 'cloudflare',
    model: getEnvValue('CLOUDFLARE_MODEL') || '@cf/openai/gpt-oss-120b',
    createModel: () => {
      if (!cloudflareAccountId || !cloudflareApiKey) return null;
      return createOpenAI({
        apiKey: cloudflareApiKey,
        compatibility: 'strict',
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/v1`,
      })(getEnvValue('CLOUDFLARE_MODEL') || '@cf/openai/gpt-oss-120b') as LanguageModelV1;
    },
  },
  ];
}

export function createFallbackModel(): LanguageModelV1 {
  const candidates = getProviderCandidates();
  const configured = candidates
    .map((candidate) => ({ ...candidate, modelInstance: candidate.createModel() }))
    .filter((candidate): candidate is typeof candidate & { modelInstance: LanguageModelV1 } => candidate.modelInstance !== null);

  if (configured.length === 0) {
    throw new Error(
      'No LLM provider is configured. Add NVIDIA_API_KEY, GROQ_API_KEY, or both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_KEY to .env.local, then restart Next.js.',
    );
  }

  const primary = configured[0];
  return wrapLanguageModel({
    model: primary.modelInstance,
    middleware: {
      wrapGenerate: async ({ params }) => {
        const failures: string[] = [];
        for (const candidate of configured) {
          const startedAt = Date.now();
          console.info('[LLM][TRY]', { provider: candidate.provider, model: candidate.model });
          const request = withRequestTimeout(params.abortSignal);
          try {
            const result = await candidate.modelInstance.doGenerate({ ...params, abortSignal: request.signal });
            console.info('[LLM][SUCCESS]', { provider: candidate.provider, model: candidate.model, duration: Date.now() - startedAt });
            return result;
          } catch (error) {
            failures.push(logProviderFailure(candidate, error, Date.now() - startedAt));
            const next = configured[configured.indexOf(candidate) + 1];
            if (next) console.info('[LLM][FALLBACK]', { provider: next.provider, model: next.model });
          } finally {
            request.clear();
          }
        }
        throw new Error(`All configured LLM providers failed: ${failures.join('; ')}`);
      },
      wrapStream: async ({ params }) => {
        const failures: string[] = [];
        for (const candidate of configured) {
          const startedAt = Date.now();
          console.info('[LLM][TRY]', { provider: candidate.provider, model: candidate.model });
          const request = withRequestTimeout(params.abortSignal);
          try {
            const result = await candidate.modelInstance.doStream({ ...params, abortSignal: request.signal });
            console.info('[LLM][SUCCESS]', { provider: candidate.provider, model: candidate.model, duration: Date.now() - startedAt });
            return result;
          } catch (error) {
            failures.push(logProviderFailure(candidate, error, Date.now() - startedAt));
            const next = configured[configured.indexOf(candidate) + 1];
            if (next) console.info('[LLM][FALLBACK]', { provider: next.provider, model: next.model });
          } finally {
            request.clear();
          }
        }
        throw new Error(`All configured LLM providers failed: ${failures.join('; ')}`);
      },
    },
  });
}

export class LLMService {
  static async runWithFallback(input: LLMRequestInput) {
    logRuntimeProviderStatus();
    const configured = getProviderCandidates().filter((candidate) => candidate.createModel() !== null);
    if (configured.length === 0) throw new Error('No LLM provider is configured');

    const result = streamText({
      model: createFallbackModel(),
      system: input.system,
      messages: input.messages,
      prompt: input.prompt,
      tools: input.tools,
      maxSteps: input.maxSteps ?? 5,
      temperature: input.temperature ?? 0.2,
    });

    return { result, provider: configured[0].provider, model: configured[0].model, attempts: [] };
  }
}
