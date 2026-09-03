import type { Profile } from "@/lib/types";

export function createEmptyProfile(userId: string): Profile {
  const timestamp = new Date(0).toISOString();
  return {
    id: userId,
    user_id: userId,
    first_name: null,
    last_name: null,
    email: null,
    phone_number: null,
    location: null,
    website: null,
    linkedin_url: null,
    github_url: null,
    work_experience: [],
    education: [],
    skills: [],
    projects: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}
