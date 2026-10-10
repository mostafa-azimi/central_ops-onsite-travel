export const ASSIGNEES = [
  "Chris Haun",
  "Mike Azimi",
  "Rob McFaul",
  "Sam Armenia",
] as const;

export type Assignee = string;

export const TRAVELER_EMAILS: Record<Assignee, string> = {
  "Chris Haun": "chris.haun@shiphero.com",
  "Mike Azimi": "mike.azimi@shiphero.com",
  "Rob McFaul": "rob.mcfaul@shiphero.com",
  "Sam Armenia": "samuel.armenia@shiphero.com",
};

export const DEFAULT_TRAVELER_COLORS: Record<string, string> = {
  "Chris Haun": "#3281fd",
  "Mike Azimi": "#9f1d20",
  "Rob McFaul": "#d89116",
  "Sam Armenia": "#32b76c",
};

export type ManagedPerson = {
  email: string;
  name: string;
  isTraveler: boolean;
  isAdmin: boolean;
  color: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  updatedByEmail: string;
};

export type TravelerProfile = Pick<ManagedPerson, "email" | "name" | "color">;

export const DEFAULT_PEOPLE: ManagedPerson[] = ASSIGNEES.map((name) => ({
  email: TRAVELER_EMAILS[name],
  name,
  isTraveler: true,
  isAdmin: name === "Mike Azimi",
  color: DEFAULT_TRAVELER_COLORS[name],
  active: true,
  createdAt: "",
  updatedAt: "",
  updatedByEmail: "",
}));

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

export type EmployeeTravelEvent = TravelEvent & {
  calendarEventId: string;
  participants: string[];
  joined: boolean;
  countryCode?: string;
  latitude: number | null;
  longitude: number | null;
};
