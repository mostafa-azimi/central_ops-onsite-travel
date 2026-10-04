import { ASSIGNEES, type Assignee } from "@/lib/types";

export const TRIP_TYPES = ["Onboarding", "Central Ops onsite"] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export type VisitSubmission = {
  submissionId: string;
  tripType: TripType;
  traveler: Assignee;
  cashUrl: string;
  cashAccountId: string;
  city: string;
  state: string;
  start: string;
  end: string;
};

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function inclusiveEndToExclusive(value: string) {
  if (!isDateOnly(value)) throw new Error("Invalid date");
  const [year, month, day] = value.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day));
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}

export function validateVisitSubmission(input: unknown) {
  if (!input || typeof input !== "object") return { ok: false as const, message: "Invalid request body." };
  const value = input as Record<string, unknown>;
  const submissionId = String(value.submissionId ?? "");
  const tripType = String(value.tripType ?? "");
  const traveler = String(value.traveler ?? "");
  const cashUrl = String(value.cashUrl ?? "");
  const city = String(value.city ?? "").trim();
  const state = String(value.state ?? "").trim().toUpperCase();
  const start = String(value.start ?? "");
  const end = String(value.end ?? "");

  if (!/^[0-9a-f-]{20,64}$/i.test(submissionId)) return { ok: false as const, message: "Invalid submission ID." };
  if (!TRIP_TYPES.includes(tripType as TripType)) return { ok: false as const, message: "Select a valid visit type." };
  if (!ASSIGNEES.includes(traveler as Assignee)) return { ok: false as const, message: "Select an approved traveler." };
  if (!city || city.length > 80) return { ok: false as const, message: "Enter a valid city." };
  if (!/^[A-Z]{2}$/.test(state)) return { ok: false as const, message: "Enter a two-letter state code." };
  if (!isDateOnly(start) || !isDateOnly(end) || end < start) return { ok: false as const, message: "Enter a valid inclusive date range." };
  const cashMatch = /^https:\/\/cash\.shiphero\.com\/client\/([1-9]\d*)\/?$/.exec(cashUrl);
  if (!cashMatch) {
    return {
      ok: false as const,
      message: "Use a CASH link in the format https://cash.shiphero.com/client/123456.",
    };
  }
  const cashAccountId = cashMatch[1];
  const canonicalCashUrl = `https://cash.shiphero.com/client/${cashAccountId}`;

  return {
    ok: true as const,
    value: {
      submissionId,
      tripType: tripType as TripType,
      traveler: traveler as Assignee,
      cashUrl: canonicalCashUrl,
      cashAccountId,
      city,
      state,
      start,
      end,
    } satisfies VisitSubmission,
  };
}
