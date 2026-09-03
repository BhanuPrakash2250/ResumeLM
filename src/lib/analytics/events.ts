export const AnalyticsEvents = {
  OnboardingCompleted: "onboarding_completed",
  ProfileCreated: "profile_created",
  ProfileCompleted: "profile_completed",
  ResumeCreated: "resume_created",
  FirstResumeSaved: "first_resume_saved",
  ResumeTailored: "resume_tailored",
  AIRequestStarted: "ai_request_started",
  AIRequestSucceeded: "ai_request_succeeded",
  FirstAIRequestSucceeded: "first_ai_request_succeeded",
  AIRequestFailed: "ai_request_failed",
  PagePerformance: "page_performance",
  ResumeEditorViewed: "resume_editor_viewed",
  ResumeEditorTabChanged: "resume_editor_tab_changed",
  ResumeEditorActionFailed: "resume_editor_action_failed",
  OutboundLinkClicked: "outbound_link_clicked",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export type AnalyticsPropertyValue = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

const SENSITIVE_PROPERTY_KEYS = new Set([
  "api_key",
  "api_keys",
  "apikey",
  "card",
  "card_number",
  "email",
  "full_email",
  "job_description",
  "password",
  "payment_method",
  "raw_email",
  "resume_content",
  "resume_text",
]);

export function sanitizeAnalyticsProperties(
  properties: AnalyticsProperties = {}
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (value === undefined) return false;
      return !SENSITIVE_PROPERTY_KEYS.has(key.toLowerCase());
    })
  ) as Record<string, string | number | boolean | null>;
}

export function buildAnalyticsPayload(input: {
  apiKey: string;
  distinctId: string;
  event: AnalyticsEventName;
  insertId?: string;
  properties?: AnalyticsProperties;
}) {
  return {
    api_key: input.apiKey,
    distinct_id: input.distinctId,
    event: input.event,
    properties: {
      ...sanitizeAnalyticsProperties(input.properties),
      analytics_user_id: input.distinctId,
      $geoip_disable: true,
      ...(input.insertId ? { $insert_id: input.insertId } : {}),
    },
  };
}

export function buildAnalyticsInsertId(userId: string, event: AnalyticsEventName) {
  return `${userId}:${event}`;
}
