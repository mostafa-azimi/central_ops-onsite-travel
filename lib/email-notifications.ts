import { createNotificationRecord, getNotificationRecord, listActiveAdminEmails, markNotificationResult, type StoredVisitRequest } from "@/lib/db";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GOOGLE_USERINFO_API = "https://openidconnect.googleapis.com/v1/userinfo";
type Fetch = typeof fetch;

let cachedToken: { value: string; expiresAt: number } | null = null;

export function emailNotificationsConfigured() {
  return Boolean(
    process.env.GOOGLE_EMAIL_CLIENT_ID &&
    process.env.GOOGLE_EMAIL_CLIENT_SECRET &&
    process.env.GOOGLE_EMAIL_REFRESH_TOKEN,
  );
}

function appOrigin() {
  return (process.env.APP_ORIGIN ?? "https://central-ops-travel.aiherolabs.xyz").replace(/\/$/, "");
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function rawMessage(to: string[], subject: string, body: string) {
  const message = [
    `To: ${to.map(cleanHeader).join(", ")}`,
    `Subject: ${cleanHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

async function accessToken(fetchImpl: Fetch) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const clientId = process.env.GOOGLE_EMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_EMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_EMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("EMAIL_NOT_CONFIGURED");
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Email token refresh failed with HTTP ${response.status}`);
  const result = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("Email token refresh returned no access token");
  cachedToken = { value: result.access_token, expiresAt: Date.now() + Math.max(60, result.expires_in ?? 3600) * 1000 };
  return result.access_token;
}

export async function verifyEmailNotificationConnection(fetchImpl: Fetch = fetch) {
  if (!emailNotificationsConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");
  const token = await accessToken(fetchImpl);
  const response = await fetchImpl(GOOGLE_USERINFO_API, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gmail sender verification failed with HTTP ${response.status}`);
  const result = (await response.json()) as { email?: string; email_verified?: boolean; hd?: string };
  const email = result.email?.trim().toLowerCase() ?? "";
  if (!result.email_verified || result.hd !== "shiphero.com" || !/^[^\s@]+@shiphero\.com$/.test(email)) {
    throw new Error("Gmail sender must be a verified ShipHero account");
  }
  const expectedSender = process.env.GOOGLE_EMAIL_SENDER?.trim().toLowerCase();
  if (expectedSender && email !== expectedSender) throw new Error("Gmail sender does not match the configured account");
  return email;
}

export async function sendNotificationEmail(
  to: string[],
  subject: string,
  body: string,
  fetchImpl: Fetch = fetch,
) {
  const recipients = [...new Set(to.map((email) => email.trim().toLowerCase()))]
    .filter((email) => /^[^\s@]+@shiphero\.com$/.test(email));
  if (recipients.length === 0) throw new Error("EMAIL_RECIPIENT_REQUIRED");
  const token = await accessToken(fetchImpl);
  const response = await fetchImpl(GMAIL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: rawMessage(recipients, subject, body) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Email send failed with HTTP ${response.status}`);
}

export async function sendNotificationBestEffort(
  to: string[],
  subject: string,
  body: string,
  fetchImpl: Fetch = fetch,
) {
  if (!emailNotificationsConfigured()) return false;
  try {
    await sendNotificationEmail(to, subject, body, fetchImpl);
    return true;
  } catch (error) {
    console.error("Email notification failed", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

async function sendDurableNotificationBestEffort(
  key: string,
  requestId: string,
  kind: string,
  to: string[],
  subject: string,
  body: string,
  fetchImpl: Fetch = fetch,
) {
  try {
    const record = await createNotificationRecord({ key, requestId, kind, recipients: to, subject, body }, fetchImpl);
    if (record.status === "sent") return true;
    if (!emailNotificationsConfigured()) {
      await markNotificationResult(record.id, { sent: false, error: "Gmail sender is not configured" }, "system", fetchImpl);
      return false;
    }
    try {
      await sendNotificationEmail(record.recipients, record.subject, record.body, fetchImpl);
      await markNotificationResult(record.id, { sent: true }, "system", fetchImpl);
      return true;
    } catch (error) {
      await markNotificationResult(record.id, { sent: false, error: error instanceof Error ? error.message : "Email delivery failed" }, "system", fetchImpl);
      return false;
    }
  } catch (error) {
    console.error("Durable email notification failed", error instanceof Error ? error.message : "Unknown error");
    return sendNotificationBestEffort(to, subject, body, fetchImpl);
  }
}

export async function retryNotification(id: string, actorEmail: string, fetchImpl: Fetch = fetch) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("INVALID_NOTIFICATION_ID");
  const record = await getNotificationRecord(id, fetchImpl);
  if (!record) throw new Error("NOTIFICATION_NOT_FOUND");
  try {
    await sendNotificationEmail(record.recipients, record.subject, record.body, fetchImpl);
    return await markNotificationResult(id, { sent: true }, actorEmail, fetchImpl);
  } catch (error) {
    await markNotificationResult(id, { sent: false, error: error instanceof Error ? error.message : "Email delivery failed" }, actorEmail, fetchImpl);
    throw error;
  }
}

function requestDetails(request: StoredVisitRequest) {
  return [
    `Account: ${request.accountName}`,
    `Visit type: ${request.tripType}`,
    `Dates: ${request.start} to ${request.end}`,
    `Location: ${request.city}, ${request.state}`,
    `Date confidence: ${request.dateConfidence}`,
  ].join("\n");
}

export async function notifyNewRequest(request: StoredVisitRequest, fetchImpl: Fetch = fetch) {
  const admins = await listActiveAdminEmails(fetchImpl).catch(() => ["mike.azimi@shiphero.com"]);
  return sendDurableNotificationBestEffort(`${request.id}:new-request`, request.id, "new_request", process.env.ADMIN_NOTIFICATION_EMAIL ? [process.env.ADMIN_NOTIFICATION_EMAIL] : admins, `Travel request: ${request.accountName}`, `${request.requesterName || request.requesterEmail} submitted a travel request.\n\n${requestDetails(request)}\n\nReview: ${appOrigin()}/admin`, fetchImpl);
}

export function notifyRequestDecision(
  request: StoredVisitRequest,
  decision: "approved" | "denied",
  reason = "",
  fetchImpl: Fetch = fetch,
) {
  return sendDurableNotificationBestEffort(`${request.id}:request-${decision}:${request.lifecycleVersion}`, request.id, `request_${decision}`, [request.requesterEmail], `Travel request ${decision}: ${request.accountName}`, `Your travel request was ${decision}.${reason ? `\nReason: ${reason}` : ""}\n\n${requestDetails(request)}${request.assignedTraveler ? `\nTraveler: ${request.assignedTraveler}` : ""}\n\nView requests: ${appOrigin()}/?view=submit`, fetchImpl);
}

export function notifyChangeRequested(request: StoredVisitRequest, recipients: string[], fetchImpl: Fetch = fetch) {
  const change = request.pendingChange?.type === "cancel"
    ? "The requester asked to cancel this visit."
    : `The requester proposed new dates: ${request.pendingChange?.start} to ${request.pendingChange?.end}.`;
  return sendDurableNotificationBestEffort(`${request.id}:change-request:${request.pendingChange?.requestedAt ?? request.lifecycleVersion}`, request.id, "change_requested", recipients, `Travel change needs review: ${request.accountName}`, `${change}\n\n${requestDetails(request)}\n\nReview: ${appOrigin()}/?view=submit`, fetchImpl);
}

export function notifyChangeDecision(
  request: StoredVisitRequest,
  decision: "approved" | "denied",
  fetchImpl: Fetch = fetch,
) {
  return sendDurableNotificationBestEffort(`${request.id}:change-${decision}:${request.lifecycleVersion}`, request.id, `change_${decision}`, [request.requesterEmail], `Travel change ${decision}: ${request.accountName}`, `Your requested travel change was ${decision}.\n\n${requestDetails(request)}\n\nView requests: ${appOrigin()}/?view=submit`, fetchImpl);
}

export function notifyVisitUpdated(
  request: StoredVisitRequest,
  action: "rescheduled" | "cancelled",
  fetchImpl: Fetch = fetch,
) {
  return sendDurableNotificationBestEffort(`${request.id}:visit-${action}:${request.lifecycleVersion}`, request.id, `visit_${action}`, [request.requesterEmail], `Travel visit ${action}: ${request.accountName}`, `An administrator ${action} this visit.\n\n${requestDetails(request)}\n\nView requests: ${appOrigin()}/?view=submit`, fetchImpl);
}

export async function notifyOperationalAlert(key: string, subject: string, body: string, fetchImpl: Fetch = fetch) {
  const admins = await listActiveAdminEmails(fetchImpl).catch(() => ["mike.azimi@shiphero.com"]);
  return sendDurableNotificationBestEffort(`operations:${key}`, "operations", "operational_alert", admins, subject, body, fetchImpl);
}

export function clearEmailTokenCacheForTests() {
  cachedToken = null;
}
