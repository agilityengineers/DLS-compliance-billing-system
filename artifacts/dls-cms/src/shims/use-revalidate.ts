import { useSyncExternalStore } from "react";
import { getRevalidate, subscribeRevalidate } from "./nav-bridge";

/** Re-renders whenever router.refresh() / revalidatePath() is called. */
export function useRevalidate(): number {
  return useSyncExternalStore(subscribeRevalidate, getRevalidate, getRevalidate);
}
