import { ASSIGNEES, type Assignee } from "@/lib/types";

export const TRIP_TYPES = ["Onboarding", "Central Ops onsite"] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const DATE_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type DateConfidence = (typeof DATE_CONFIDENCE_LEVELS)[number];

export const READINESS_ITEMS = [
  { key: "carriersTested", group: "System setup", label: "Carriers added and tested", scored: true },
  { key: "locationsValidated", group: "System setup", label: "Locations validated and in ShipHero", scored: true },
  { key: "hospitalEnabled", group: "System setup", label: "Hospital enabled", scored: true },
  { key: "automationRulesConfigured", group: "System setup", label: "Automation rules configured", scored: true },
  { key: "usersConfigured", group: "System setup", label: "Users created with proper permissions, including Tote QA", scored: true },
  { key: "usingLpns", group: "System setup", label: "Using LPNs", scored: false },
  { key: "locationsLabeled", group: "Warehouse setup", label: "Locations labeled in the warehouse", scored: true },
  { key: "totesApplied", group: "Warehouse setup", label: "Totes printed and applied", scored: true },
  { key: "productBarcodesTested", group: "Warehouse setup", label: "Product barcodes tested and scanned", scored: true },
  { key: "inventoryPlanReady", group: "Warehouse setup", label: "Inventory is in, or the process has been discussed and agreed", scored: true },
  { key: "pinsAndBadgesReady", group: "Warehouse setup", label: "PINs set up and badges printed", scored: true },
  { key: "packStationHardwareReady", group: "Warehouse setup", label: "Pack station hardware set up and tested", scored: true },
  { key: "mobileHardwareReady", group: "Warehouse setup", label: "Mobile hardware set up and tested", scored: true },
] as const;

export type ReadinessKey = (typeof READINESS_ITEMS)[number]["key"];
export type ReadinessAnswers = Record<ReadinessKey, boolean>;

export function readinessScore(answers: ReadinessAnswers | null) {
  const scored = READINESS_ITEMS.filter((item) => item.scored);
  return {
    ready: answers ? scored.filter((item) => answers[item.key]).length : 0,
    total: scored.length,
    blockers: answers ? scored.filter((item) => !answers[item.key]) : [],
  };
}

export type VisitSubmission = {
  submissionId: string;
  tripType: TripType;
  traveler: Assignee;
  dateConfidence: DateConfidence;
  accountName: string;
  cashUrl: string;
  cashAccountId: string;
  fullAddress: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string;
  start: string;
  end: string;
  readiness: ReadinessAnswers;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  warehouseStartTime: string;
};

export type VisitRequestInput = Omit<VisitSubmission, "traveler">;
export type VisitRequestSubmission = VisitRequestInput & {
  requesterEmail: string;
  requesterName: string;
};

export function normalizeAccountName(input: unknown) {
  const value = String(input ?? "").trim().replace(/\s+/g, " ");
  if (!value || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export function normalizeCustomerLink(input: unknown) {
  let value = String(input ?? "").trim();
  if (!value || value.length > 500 || /[\u0000-\u001f\u007f\s]/.test(value)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) return null;
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function cashAccountIdFromLink(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "cash.shiphero.com") return "";
    const match = /(?:^|\/)client\/([1-9]\d*)(?:\/|$)/i.exec(url.pathname);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

export function addressWithPostalCode(fullAddress: string, postalCode: string) {
  const addressKey = fullAddress.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const postalKey = postalCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return postalKey && !addressKey.includes(postalKey) ? `${fullAddress}, ${postalCode}` : fullAddress;
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
  const dateConfidence = String(value.dateConfidence ?? "").toLowerCase();
  const accountName = normalizeAccountName(value.accountName);
  const cashUrl = normalizeCustomerLink(value.cashUrl);
  const fullAddress = String(value.fullAddress ?? "").trim().replace(/\s+/g, " ");
  const city = String(value.city ?? "").trim();
  const rawState = String(value.state ?? value.region ?? "").trim();
  const state = rawState.length === 2 ? rawState.toUpperCase() : rawState;
  const postalCode = String(value.postalCode ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const countryCode = String(value.countryCode ?? "").trim().toUpperCase();
  const latitudeValue = value.latitude === "" || value.latitude == null ? null : Number(value.latitude);
  const longitudeValue = value.longitude === "" || value.longitude == null ? null : Number(value.longitude);
  const placeId = String(value.placeId ?? "").trim();
  const start = String(value.start ?? "");
  const end = String(value.end ?? "");
  const readinessSource = value.readiness && typeof value.readiness === "object"
    ? value.readiness as Record<string, unknown>
    : null;
  const readiness = {} as ReadinessAnswers;
  for (const item of READINESS_ITEMS) {
    if (!readinessSource || typeof readinessSource[item.key] !== "boolean") {
      return { ok: false as const, message: "Answer every readiness question with Yes or No." };
    }
    readiness[item.key] = readinessSource[item.key] as boolean;
  }
  const contactName = String(value.contactName ?? "").trim().replace(/\s+/g, " ");
  const contactEmail = String(value.contactEmail ?? "").trim().toLowerCase();
  const contactPhone = String(value.contactPhone ?? "").trim().replace(/\s+/g, " ");
  const warehouseStartTime = String(value.warehouseStartTime ?? "").trim();

  if (!/^[0-9a-f-]{20,64}$/i.test(submissionId)) return { ok: false as const, message: "Invalid submission ID." };
  if (!TRIP_TYPES.includes(tripType as TripType)) return { ok: false as const, message: "Select a valid visit type." };
  if (!ASSIGNEES.includes(traveler as Assignee)) return { ok: false as const, message: "Select an approved traveler." };
  if (!DATE_CONFIDENCE_LEVELS.includes(dateConfidence as DateConfidence)) {
    return { ok: false as const, message: "Select low, medium, or high date confidence." };
  }
  if (!accountName) return { ok: false as const, message: "Enter a valid account name." };
  if (!fullAddress || fullAddress.length > 240) return { ok: false as const, message: "Enter a valid full address." };
  if (!city || city.length > 80) return { ok: false as const, message: "Enter a valid city." };
  if (!state || state.length > 100) return { ok: false as const, message: "Enter a valid state, province, or region." };
  if (postalCode.length < 2 || postalCode.length > 16 || !/^[A-Z0-9][A-Z0-9 -]*[A-Z0-9]$/.test(postalCode)) {
    return { ok: false as const, message: "Enter a valid ZIP or postal code." };
  }
  if (countryCode === "US" && !/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
    return { ok: false as const, message: "Enter a valid 5-digit US ZIP code." };
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) return { ok: false as const, message: "Select a valid country." };
  if ((latitudeValue == null) !== (longitudeValue == null)) return { ok: false as const, message: "Address coordinates are incomplete." };
  if (latitudeValue != null && (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90)) {
    return { ok: false as const, message: "Address latitude is invalid." };
  }
  if (longitudeValue != null && (!Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180)) {
    return { ok: false as const, message: "Address longitude is invalid." };
  }
  if (!isDateOnly(start) || !isDateOnly(end) || end < start) return { ok: false as const, message: "Enter a valid inclusive date range." };
  if (!cashUrl) return { ok: false as const, message: "Enter a valid HTTP or HTTPS customer link." };
  if (!contactName || contactName.length > 120 || /[\u0000-\u001f\u007f]/.test(contactName)) {
    return { ok: false as const, message: "Enter the onsite point of contact." };
  }
  if (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false as const, message: "Enter a valid point-of-contact email." };
  }
  if (contactPhone.length < 7 || contactPhone.length > 40 || !/^[0-9+(). x-]+$/i.test(contactPhone)) {
    return { ok: false as const, message: "Enter a valid point-of-contact phone number." };
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(warehouseStartTime)) {
    return { ok: false as const, message: "Select the warehouse start time." };
  }
  const cashAccountId = cashAccountIdFromLink(cashUrl);

  return {
    ok: true as const,
    value: {
      submissionId,
      tripType: tripType as TripType,
      traveler: traveler as Assignee,
      dateConfidence: dateConfidence as DateConfidence,
      accountName,
      cashUrl,
      cashAccountId,
      fullAddress,
      city,
      state,
      postalCode,
      countryCode,
      latitude: latitudeValue,
      longitude: longitudeValue,
      placeId,
      start,
      end,
      readiness,
      contactName,
      contactEmail,
      contactPhone,
      warehouseStartTime,
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
  const request: VisitRequestInput = {
    submissionId: parsed.value.submissionId,
    tripType: parsed.value.tripType,
    dateConfidence: parsed.value.dateConfidence,
    accountName: parsed.value.accountName,
    cashUrl: parsed.value.cashUrl,
    cashAccountId: parsed.value.cashAccountId,
    fullAddress: parsed.value.fullAddress,
    city: parsed.value.city,
    state: parsed.value.state,
    postalCode: parsed.value.postalCode,
    countryCode: parsed.value.countryCode,
    latitude: parsed.value.latitude,
    longitude: parsed.value.longitude,
    placeId: parsed.value.placeId,
    start: parsed.value.start,
    end: parsed.value.end,
    readiness: parsed.value.readiness,
    contactName: parsed.value.contactName,
    contactEmail: parsed.value.contactEmail,
    contactPhone: parsed.value.contactPhone,
    warehouseStartTime: parsed.value.warehouseStartTime,
  };
  return { ok: true as const, value: request };
}

export function validateVisitChange(input: unknown) {
  if (!input || typeof input !== "object") return { ok: false as const, message: "Invalid change request." };
  const value = input as Record<string, unknown>;
  const action = String(value.action ?? "");
  if (action === "request_cancel") {
    return { ok: true as const, value: { type: "cancel" as const, start: null, end: null } };
  }
  if (action !== "request_reschedule") {
    return { ok: false as const, message: "Select cancel or reschedule." };
  }
  const start = String(value.start ?? "");
  const end = String(value.end ?? "");
  if (!isDateOnly(start) || !isDateOnly(end) || end < start) {
    return { ok: false as const, message: "Enter a valid inclusive date range." };
  }
  return { ok: true as const, value: { type: "reschedule" as const, start, end } };
}
