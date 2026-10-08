import type { Assignee } from "@/lib/types";

export const TRAVELER_MAP_COLORS: Record<Assignee, string> = {
  "Chris Haun": "#3281fd",
  "Mike Azimi": "#9f1d20",
  "Rob McFaul": "#d89116",
  "Sam Armenia": "#32b76c",
};

const TRAVELER_MAP_CLASSES: Record<Assignee, string> = {
  "Chris Haun": "traveler-chris",
  "Mike Azimi": "traveler-mike",
  "Rob McFaul": "traveler-rob",
  "Sam Armenia": "traveler-sam",
};

export function travelerColorClass(assignee: Assignee) {
  return TRAVELER_MAP_CLASSES[assignee];
}

