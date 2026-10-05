import { ASSIGNEES, type Assignee } from "@/lib/types";

export const TRIP_TYPES = ["Onboarding", "Central Ops onsite"] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export type VisitSubmission = {
  submissionId: string;
  tripType: TripType;
  traveler: Assignee;
  accountName: string;
  cashUrl: string;
  cashAccountId: string;
  fullAddress: string;
  city: string;
  state: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string;
  start: string;
  end: string;
};

export type VisitRequestSubmission = Omit<VisitSubmission, "traveler">;

export function normalizeAccountName(input: unknown) {
  const value = String(input ?? "").trim().replace(/\s+/g, " ");
  if (!value || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

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
  const accountName = normalizeAccountName(value.accountName);
  const cashUrl = String(value.cashUrl ?? "");
  const fullAddress = String(value.fullAddress ?? "").trim().replace(/\s+/g, " ");
  const city = String(value.city ?? "").trim();
  const rawState = String(value.state ?? value.region ?? "").trim();
  const state = rawState.length === 2 ? rawState.toUpperCase() : rawState;
  const countryCode = String(value.countryCode ?? "").trim().toUpperCase();
  const latitudeValue = value.latitude === "" || value.latitude == null ? null : Number(value.latitude);
  const longitudeValue = value.longitude === "" || value.longitude == null ? null : Number(value.longitude);
  const placeId = String(value.placeId ?? "").trim();
  const start = String(value.start ?? "");
  const end = String(value.end ?? "");

  if (!/^[0-9a-f-]{20,64}$/i.test(submissionId)) return { ok: false as const, message: "Invalid submission ID." };
  if (!TRIP_TYPES.includes(tripType as TripType)) return { ok: false as const, message: "Select a valid visit type." };
  if (!ASSIGNEES.includes(traveler as Assignee)) return { ok: false as const, message: "Select an approved traveler." };
  if (!accountName) return { ok: false as const, message: "Enter a valid account name." };
  if (!fullAddress || fullAddress.length > 240) return { ok: false as const, message: "Enter a valid full address." };
  if (!city || city.length > 80) return { ok: false as const, message: "Enter a valid city." };
  if (!state || state.length > 100) return { ok: false as const, message: "Enter a valid state, province, or region." };
  if (!/^[A-Z]{2}$/.test(countryCode)) return { ok: false as const, message: "Select a valid country." };
  if ((latitudeValue == null) !== (longitudeValue == null)) return { ok: false as const, message: "Address coordinates are incomplete." };
  if (latitudeValue != null && (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90)) {
    return { ok: false as const, message: "Address latitude is invalid." };
  }
  if (longitudeValue != null && (!Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180)) {
    return { ok: false as const, message: "Address longitude is invalid." };
  }
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
      accountName,
      cashUrl: canonicalCashUrl,
      cashAccountId,
      fullAddress,
      city,
      state,
      countryCode,
      latitude: latitudeValue,
      longitude: longitudeValue,
      placeId,
      start,
      end,
    } satisfies VisitSubmission,
  };
}

export function validateVisitRequest(input: unknown) {
  if (!input || typeof input !== "object") return { ok: false as const, message: "Invalid request body." };
  const source = input as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(source, "traveler")) {
    return { ok: false as const, message: "Travelers can only be assigned by an approved administrator." };
  }

  const parsed = validateVisitSubmission({ ...source, traveler: "Mike Azimi" });
  if (!parsed.ok) return parsed;
  const request: VisitRequestSubmission = {
    submissionId: parsed.value.submissionId,
    tripType: parsed.value.tripType,
    accountName: parsed.value.accountName,
    cashUrl: parsed.value.cashUrl,
    cashAccountId: parsed.value.cashAccountId,
    fullAddress: parsed.value.fullAddress,
    city: parsed.value.city,
    state: parsed.value.state,
    countryCode: parsed.value.countryCode,
    latitude: parsed.value.latitude,
    longitude: parsed.value.longitude,
    placeId: parsed.value.placeId,
    start: parsed.value.start,
    end: parsed.value.end,
  };
  return { ok: true as const, value: request };
}
