import type { LanguageModelUsage, LanguageModelV1, TelemetrySettings } from "ai";

import { checkRateLimit } from "@/lib/rateLimiter";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { captureServerAnalyticsEvent } from "@/lib/analytics/server";
import {
} from "@/lib/ai/reliability";
import { buildPostHogAITelemetry } from "@/lib/ai/posthog-telemetry";
import type { ResolvedAIRequest } from "@/lib/ai/access-control";
import type { AIConfig } from "@/utils/ai-tools";
import { createServiceClient } from "@/utils/supabase/server";
import { createFallbackModel, getLLMProviderStatus } from "@/lib/llm-service";

type AIUsageStatus = "succeeded" | "failed" | "rate_limited" | "blocked";

export function getAIErrorCategory(errorCode?: string | null): string | null {
  if (!errorCode) return null;

  const normalized = errorCode.toLowerCase();
  if (normalized.includes("quota") || normalized.includes("credit") || normalized.includes("payment")) {
    return "provider_billing";
  }
  if (normalized.includes("api key") || normalized.includes("key not found") || normalized.includes("authentication")) {
    return "provider_authentication";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "rate_limited";
  }
  if (normalized.includes("schema") || normalized.includes("parse") || normalized.includes("tool")) {
    return "invalid_model_output";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "timeout";
  }
  if (normalized.includes("unavailable") || normalized.includes("network") || normalized.includes("fetch")) {
    return "provider_unavailable";
  }
  return "provider_error";
}

export class AIUsageError extends Error {
  constructor(
    message: string,
    public readonly code: "blocked" | "rate_limited" | "failed",
    public readonly status: number = 500,
    public readonly fallbackModelId?: string,
  ) {
    super(message);
    this.name = "AIUsageError";
  }
}

export async function recordAIUsageStarted(input: {
  userId: string | null;
  route: string;
  provider: string;
  model: string;
  isPro: boolean;
  usedServerKey: boolean;
}): Promise<string> {
  if (!input.userId) {
    return "";
  }

  try {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("ai_usage_events")
    .insert({
      user_id: input.userId,
      route: input.route,
      provider: input.provider,
      model: input.model,
      is_pro: input.isPro,
      used_server_key: input.usedServerKey,
      status: "started",
    })
    .select("id")
    .single();

  if (error) {
    console.warn("Unable to record AI usage start", { error: error.message });
    return "";
  }

  await captureServerAnalyticsEvent({
    distinctId: input.userId,
    event: AnalyticsEvents.AIRequestStarted,
    properties: {
      route: input.route,
      provider: input.provider,
      model: input.model,
      status: "started",
    },
  });

  return data.id;
  } catch (error) {
    console.warn("Unable to record AI usage start", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return "";
  }
}

export async function recordAIUsageFinished(input: {
  id: string;
  status: AIUsageStatus;
  errorCode?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): Promise<void> {
  if (!input.id) {
    return;
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("ai_usage_events")
      .update({
        status: input.status,
        error_code: input.errorCode ?? null,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        total_tokens: input.totalTokens ?? null,
      })
      .eq("id", input.id)
      .select("user_id, route, provider, model, status, input_tokens, output_tokens, total_tokens, error_code, created_at")
      .single();

    if (error) {
      console.warn("Unable to record AI usage completion", { error: error.message });
      return;
    }

  const durationMs = data.created_at
    ? Math.max(0, Date.now() - Date.parse(data.created_at))
    : null;
  const analyticsProperties = {
    route: data.route,
    provider: data.provider,
    model: data.model,
    status: data.status,
    duration_ms: durationMs,
    input_tokens: data.input_tokens,
    output_tokens: data.output_tokens,
    total_tokens: data.total_tokens,
    error_category: getAIErrorCategory(data.error_code),
  };

  await captureServerAnalyticsEvent({
    distinctId: data.user_id,
    event: input.status === "succeeded"
      ? AnalyticsEvents.AIRequestSucceeded
      : AnalyticsEvents.AIRequestFailed,
    properties: analyticsProperties,
  });

  if (input.status === "succeeded") {
    try {
      const { count } = await supabase
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.user_id)
        .eq("status", "succeeded");

      if (count === 1) {
        await captureServerAnalyticsEvent({
          distinctId: data.user_id,
          event: AnalyticsEvents.FirstAIRequestSucceeded,
          insertId: `${data.user_id}:${AnalyticsEvents.FirstAIRequestSucceeded}`,
          properties: analyticsProperties,
        });
      }
    } catch (analyticsError) {
      console.warn("Unable to determine first successful AI request", {
        userId: data.user_id,
        error: analyticsError instanceof Error ? analyticsError.message : "Unknown error",
      });
    }
  }
  } catch (error) {
    console.warn("Unable to record AI usage completion", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export function usageFromLanguageModelUsage(usage?: LanguageModelUsage) {
  if (!usage) {
    return {};
  }

  return {
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  };
}

export async function finishAIUsageRequest(input: {
  usageEventId: string;
  status: AIUsageStatus;
  usage?: LanguageModelUsage;
  errorCode?: string;
}) {
  await recordAIUsageFinished({
    id: input.usageEventId,
    status: input.status,
    errorCode: input.errorCode,
    ...usageFromLanguageModelUsage(input.usage),
  });
}

export async function startAIUsageRequest(input: {
  userId: string | null;
  route: string;
  config?: AIConfig;
  isPro: boolean;
  useThinking?: boolean;
}): Promise<{
  model: LanguageModelV1;
  usageEventId: string;
  resolved: ResolvedAIRequest;
  telemetry: TelemetrySettings;
}> {
  const providerStatus = getLLMProviderStatus();
  const provider = providerStatus.nvidia
    ? "nvidia"
    : providerStatus.groq
      ? "groq"
      : "cloudflare";
  const model = providerStatus.nvidia
    ? process.env.NVIDIA_MODEL?.trim() || "nvidia/nemotron-3-super-120b-a12b"
    : providerStatus.groq
      ? process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b"
      : process.env.CLOUDFLARE_MODEL?.trim() || "@cf/openai/gpt-oss-120b";
  const resolved: ResolvedAIRequest = {
    providerId: provider,
    modelId: model,
    apiKey: "server-configured",
    usedServerKey: true,
    requiresRateLimit: false,
  };

  let usageEventId = "";
  try {
    usageEventId = await recordAIUsageStarted({
      userId: null,
      route: input.route,
      provider: resolved.providerId,
      model: resolved.modelId,
      isPro: input.isPro,
      usedServerKey: resolved.usedServerKey,
    });
  } catch (error) {
    const isMissingSupabaseConfig = error instanceof Error
      && error.message.startsWith("Supabase server configuration is missing.");

    void isMissingSupabaseConfig;
    console.warn("Skipping AI usage tracking", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  if (resolved.requiresRateLimit) {
    try {
      if (input.userId) {
        await checkRateLimit(input.userId);
      }
    } catch (error) {
      await recordAIUsageFinished({
        id: usageEventId,
        status: "rate_limited",
        errorCode: error instanceof Error ? error.message : "rate_limit_exceeded",
      });

      throw new AIUsageError(
        error instanceof Error ? error.message : "Rate limit exceeded",
        "rate_limited",
        429
      );
    }
  }

  return {
    model: createFallbackModel(),
    usageEventId,
    resolved,
    telemetry: buildPostHogAITelemetry({
      route: input.route,
      userId: input.userId ?? "unauthenticated",
      usageEventId,
      isPro: input.isPro,
      resolved,
    }),
  };
}
