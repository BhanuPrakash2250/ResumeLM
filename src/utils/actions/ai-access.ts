import { getAnonymousUser } from "@/utils/actions";

export async function getAIPlanState() {
  const user = await getAnonymousUser();

  return {
    isPro: true,
    userId: user.id,
  };
}