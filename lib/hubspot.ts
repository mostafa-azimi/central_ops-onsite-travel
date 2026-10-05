import type { StoredVisitRequest } from "@/lib/db";

const HUBSPOT_API = "https://api.hubapi.com";
const MEETING_TO_COMPANY_ASSOCIATION = 188;
type Fetch = typeof fetch;

type HubSpotRecord = {
  id: string;
  properties?: Record<string, string | null>;
};

export type HubSpotCompany = { id: string; name: string; timeZone: string };

export function hubSpotConfigured() {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
}

function headers() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_NOT_CONFIGURED");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function responseMessage(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: string; category?: string };
    return parsed.message ?? parsed.category ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function findVerifiedCompany(
  cashAccountId: string,
  canonicalCashUrl: string,
  fetchImpl: Fetch = fetch,
): Promise<HubSpotCompany> {
  const response = await fetchImpl(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "account_id", operator: "EQ", value: cashAccountId }] }],
      properties: ["account_id", "name", "shiphero_cash__account_url", "timezone"],
      limit: 2,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HubSpot company lookup failed: ${await responseMessage(response)}`);
  const body = (await response.json()) as { results?: HubSpotRecord[] };
  if (body.results?.length !== 1) throw new Error("HubSpot company lookup did not return exactly one company");
  const company = body.results[0];
  const properties = company.properties ?? {};
  const savedCashUrl = String(properties.shiphero_cash__account_url ?? "").replace(/\/$/, "");
  if (properties.account_id !== cashAccountId || savedCashUrl !== canonicalCashUrl) {
    throw new Error("HubSpot company does not match the verified CASH account");
  }
  const timeZone = String(properties.timezone ?? "").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new Error("HubSpot company has no valid Time Zone");
  }
  return { id: company.id, name: String(properties.name ?? "Customer").trim() || "Customer", timeZone };
}

function localDateTimeUtc(date: string, hour: number, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let guess = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    guess -= represented - target;
  }
  return new Date(guess).toISOString();
}

export function meetingTimes(startDate: string, timeZone: string) {
  return {
    start: localDateTimeUtc(startDate, 9, timeZone),
    end: localDateTimeUtc(startDate, 15, timeZone),
  };
}

function meetingTitle(request: StoredVisitRequest, companyName: string) {
  return `${request.tripType}: ${companyName} [Central Ops ${request.id}]`;
}

async function findExistingMeeting(
  title: string,
  fetchImpl: Fetch,
): Promise<HubSpotRecord | null> {
  const response = await fetchImpl(`${HUBSPOT_API}/crm/v3/objects/meetings/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "hs_meeting_title", operator: "EQ", value: title }] }],
      properties: ["hs_meeting_title", "hs_meeting_external_url"],
      limit: 2,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HubSpot meeting recovery lookup failed: ${await responseMessage(response)}`);
  const body = (await response.json()) as { results?: HubSpotRecord[] };
  if ((body.results?.length ?? 0) > 1) throw new Error("HubSpot meeting recovery found duplicates");
  return body.results?.[0] ?? null;
}

export async function createOrGetHubSpotMeeting(
  request: StoredVisitRequest,
  company: HubSpotCompany,
  calendarUrl: string,
  fetchImpl: Fetch = fetch,
) {
  const title = meetingTitle(request, company.name);
  const existing = await findExistingMeeting(title, fetchImpl);
  if (existing) {
    if (existing.properties?.hs_meeting_external_url !== calendarUrl) {
      throw new Error("Recovered HubSpot meeting does not match the Calendar event");
    }
    return existing.id;
  }

  const times = meetingTimes(request.start, company.timeZone);
  const response = await fetchImpl(`${HUBSPOT_API}/crm/v3/objects/meetings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      properties: {
        hs_timestamp: times.start,
        hs_meeting_start_time: times.start,
        hs_meeting_end_time: times.end,
        hs_meeting_title: title,
        hs_meeting_location: `${request.city}, ${request.state}`,
        hs_meeting_external_url: calendarUrl,
        hs_meeting_outcome: "SCHEDULED",
        hs_activity_type: "On-Site",
      },
      associations: [{
        to: { id: company.id },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: MEETING_TO_COMPANY_ASSOCIATION }],
      }],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HubSpot meeting creation failed: ${await responseMessage(response)}`);
  const meeting = (await response.json()) as HubSpotRecord;
  if (!meeting.id) throw new Error("HubSpot meeting creation returned no ID");
  return meeting.id;
}
