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

export const TRAVELER_COLOR_OPTIONS = [
  { label: "Hero blue", value: "#3281fd" },
  { label: "Blood red", value: "#9f1d20" },
  { label: "Golden orange", value: "#d89116" },
  { label: "Emerald", value: "#32b76c" },
  { label: "Teal", value: "#008c95" },
  { label: "Brand red", value: "#ef5252" },
  { label: "Deep blue", value: "#1b5eaa" },
  { label: "Navy", value: "#263444" },
  { label: "Magenta", value: "#c13c9a" },
  { label: "Yellow", value: "#ffe119" },
  { label: "Walnut", value: "#8c5a2b" },
  { label: "Lime", value: "#6f9f18" },
  { label: "Steel", value: "#8392a7" },
  { label: "Onyx", value: "#000000" },
  { label: "Cyan", value: "#00b8d9" },
] as const;

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
