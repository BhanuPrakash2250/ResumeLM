import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  AIProviderError,
  assertProviderCircuitClosed,
  classifyAIError,
  clearInMemoryAIHealthCache,
  getAIErrorUserMessage,
  recordProviderFailure,
  retryAIProviderCall,
} from "@/lib/ai/reliability";

const context = {
  providerId: "openrouter" as const,
  modelId: "openai/gpt-5.6-luna",
  apiKey: "test-key",
  usedServerKey: true,
};

afterEach(() => {
  clearInMemoryAIHealthCache();
});

describe("AI provider reliability", () => {
  it("classifies tool validation errors without treating them as provider outages", () => {
    const error = Object.assign(new Error("AI_InvalidToolArgumentsError: ZodError"), {
      name: "AI_InvalidToolArgumentsError",
    });
    const classification = classifyAIError(error);

    assert.equal(classification.kind, "invalid_model_output");
    assert.equal(classification.retryable, false);
    assert.equal(getAIErrorUserMessage(error), "The AI returned invalid resume data. Please try again.");
  });

  it("classifies provider HTTP 500 and timeout as transient", () => {
    assert.equal(classifyAIError(Object.assign(new Error("HTTP 500"), { statusCode: 500 })).kind, "transient");
    assert.equal(classifyAIError(new Error("request timed out")).kind, "transient");
  });

  it("does not retry quota exhaustion even when the provider returns 429", () => {
    const classification = classifyAIError({
      statusCode: 429,
      message: "You exceeded your current quota; please check billing",
    });

    assert.equal(classification.kind, "exhausted_credits");
    assert.equal(classification.retryable, false);
  });

  it("retries transient rate limits and server failures", () => {
    assert.equal(
      classifyAIError({ statusCode: 429, message: "Too many requests" }).retryable,
      true,
    );
    assert.equal(
      classifyAIError({ statusCode: 503, message: "Provider unavailable" }).retryable,
      true,
    );
    assert.equal(
      classifyAIError(new Error("fetch failed: ECONNRESET")).retryable,
      true,
    );
  });

  it("does not retry missing keys or invalid models", () => {
    assert.equal(
      classifyAIError(new Error("OpenRouter API key not found in user configuration")).retryable,
      false,
    );
    assert.equal(
      classifyAIError({ statusCode: 400, message: "Model not found" }).kind,
      "invalid_model",
    );
  });

  it("retries a transient operation at most twice", async () => {
    let attempts = 0;
    const waits: number[] = [];

    const result = await retryAIProviderCall(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw { statusCode: 503, message: "temporary outage" };
        }
        return "ok";
      },
      context,
      { sleep: async milliseconds => { waits.push(milliseconds); } },
    );

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
    assert.equal(waits.length, 2);
  });

  it("opens a short-lived circuit for an exhausted key", async () => {
    await recordProviderFailure(context, {
      kind: "exhausted_credits",
      retryable: false,
      statusCode: 402,
      message: "No credits remaining",
    });

    await assert.rejects(
      () => assertProviderCircuitClosed(context),
      (error: unknown) =>
        error instanceof AIProviderError &&
        error.message.includes("This model is unavailable"),
    );
  });
});
