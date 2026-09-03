'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PostHogReactProvider } from 'posthog-js/react';
import { sanitizeAnalyticsProperties } from '@/lib/analytics/events';
import { readBrowserAnalyticsAnonymousId } from '@/lib/analytics/attribution';
import { OutboundLinkTracker } from './outbound-link-tracker';

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
let hasInitialized = false;
let activeIdentifiedUserId: string | null = null;

interface AnalyticsUser {
  id: string;
}

export function PostHogProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: AnalyticsUser | null;
}) {
  useEffect(() => {
    if (!posthogKey || hasInitialized) return;

    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: '2026-01-30',
      capture_pageview: false,
      capture_pageleave: true,
    });

    hasInitialized = true;
  }, []);

  useEffect(() => {
    if (!posthogKey || !hasInitialized) return;

    if (!user?.id) {
      // Public and auth route groups mount separate providers. Do not reset
      // the anonymous ID just because a provider remounted; that would break
      // the landing-page -> sign-in journey. Reset only after an identified
      // session actually leaves the app.
      if (activeIdentifiedUserId) {
        posthog.reset();
        activeIdentifiedUserId = null;
      }
      return;
    }

    const anonymousId = readBrowserAnalyticsAnonymousId();
    posthog.identify(user.id, sanitizeAnalyticsProperties({
      analytics_user_id: user.id,
      analytics_anonymous_id: anonymousId,
    }));
    activeIdentifiedUserId = user.id;
    posthog.register({
      analytics_identity: user.id,
      analytics_user_id: user.id,
      ...(anonymousId ? { analytics_anonymous_id: anonymousId } : {}),
    });
  }, [user?.id]);

  return (
    <PostHogReactProvider client={posthog}>
      <OutboundLinkTracker />
      {children}
    </PostHogReactProvider>
  );
}
