import { DEFAULT_TRAVELER_COLORS, type Assignee } from "@/lib/types";

export const TRAVELER_MAP_COLORS: Record<string, string> = DEFAULT_TRAVELER_COLORS;

export function travelerColorClass(assignee: Assignee) {
  return `traveler-${assignee.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function travelerColor(assignee: string, profiles: Array<{ name: string; color: string }> = []) {
  return profiles.find((person) => person.name === assignee)?.color
    ?? TRAVELER_MAP_COLORS[assignee]
    ?? "#3281fd";
}

