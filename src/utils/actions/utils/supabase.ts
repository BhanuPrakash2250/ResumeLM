import { createServiceClient } from "../../supabase/server";
import { getAnonymousUser } from "@/utils/actions";

// Shared Supabase client initialization
export async function getAuthenticatedClient() {
  const supabase = await createServiceClient();
  const user = await getAnonymousUser();
  return { supabase, user };
}

export async function getServiceClient() {
  const supabase = await createServiceClient();
  return { supabase };
} 