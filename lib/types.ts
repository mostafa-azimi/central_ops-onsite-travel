export const ASSIGNEES = [
  "Chris Haun",
  "Mike Azimi",
  "Rob McFaul",
  "Sam Armenia",
] as const;

export type Assignee = (typeof ASSIGNEES)[number];

export type TravelEvent = {
  id: string;
  assignee: Assignee;
  customer: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
};

export type TravelFeed = {
  events: TravelEvent[];
  refreshedAt: string;
  source: "live" | "snapshot";
};
