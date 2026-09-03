'use server'

import { Profile, ResumeSummary } from "@/lib/types";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { createEmptyProfile } from "@/lib/profile";


export interface DashboardData {
  profile: Profile | null;
  baseResumes: ResumeSummary[];
  tailoredResumes: ResumeSummary[];
}

export const getAnonymousUser = cache(async () => {
  const sessionId = (await cookies()).get("anonymous_session_id")?.value;
  if (!sessionId) {
    throw new Error("Anonymous session is not initialized");
  }
  return { id: sessionId };
});

export const getProfileForUser = cache(async () => {
  const supabase = await createClient();
  const user = await getAnonymousUser();
  return supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
});

export async function getProfilePageData() {
  const { data: profile } = await getProfileForUser();
  return {
    user: await getAnonymousUser(),
    profile,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const user = await getAnonymousUser();
  const [{ data: profile }, { data: resumes, error }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('resumes').select('*').eq('anonymous_session_id', user.id).order('created_at', { ascending: false }),
  ]);

  if (error) throw error;
  const dashboardResumes = resumes ?? [];

  return {
    profile: profile ?? createEmptyProfile(user.id),
    baseResumes: dashboardResumes.filter((resume) => resume.is_base_resume),
    tailoredResumes: dashboardResumes.filter((resume) => !resume.is_base_resume),
  };
}

export interface ResumePageData {
  resumes: ResumeSummary[];
  totalCount: number;
}

export async function getResumesPageData({
  page,
  pageSize,
  sort,
  direction,
}: {
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
}): Promise<ResumePageData> {
  void page;
  void pageSize;
  void sort;
  void direction;
  return {
    resumes: [],
    totalCount: 0,
  };
}
