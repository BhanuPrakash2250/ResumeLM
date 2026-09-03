import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { formatLLMProviderStatus, getLLMProviderStatus } from "@/lib/llm-service";

const providerEnvironmentNames = [
  "NVIDIA_API_KEY",
  "GROQ_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_TOKEN",
] as const;

const originalEnvironment = Object.fromEntries(
  providerEnvironmentNames.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of providerEnvironmentNames) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("LLM provider detection", () => {
  it("detects each provider using non-secret values", () => {
    process.env.NVIDIA_API_KEY = " fake-nvidia-key ";
    process.env.GROQ_API_KEY = " fake-groq-key ";
    process.env.CLOUDFLARE_ACCOUNT_ID = " fake-account-id ";
    process.env.CLOUDFLARE_API_KEY = " fake-cloudflare-key ";

    assert.deepEqual(getLLMProviderStatus(), {
      nvidia: true,
      groq: true,
      cloudflare: true,
    });
  });

  it("requires both Cloudflare values and ignores whitespace-only values", () => {
    process.env.NVIDIA_API_KEY = "   ";
    process.env.GROQ_API_KEY = "";
    process.env.CLOUDFLARE_ACCOUNT_ID = " fake-account-id ";
    process.env.CLOUDFLARE_API_KEY = "   ";

    assert.deepEqual(getLLMProviderStatus(), {
      nvidia: false,
      groq: false,
      cloudflare: false,
    });
  });

  it("formats a safe diagnostic without including values", () => {
    process.env.GROQ_API_KEY = "fake-groq-key";

    assert.equal(
      formatLLMProviderStatus(),
      "NVIDIA_API_KEY: missing\nGROQ_API_KEY: configured\nCLOUDFLARE_ACCOUNT_ID: missing\nCLOUDFLARE_API_KEY: missing",
    );
  });
});