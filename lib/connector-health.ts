import { adminAuthConfigured } from "@/lib/admin-auth";
import { databaseConfigured, verifyDatabaseConnection } from "@/lib/db";
import { emailNotificationsConfigured, verifyEmailNotificationConnection } from "@/lib/email-notifications";
import { fetchGoogleTravelEvents, googleCalendarConfigured } from "@/lib/google-calendar";

export type ConnectorState = "connected" | "pending" | "error";
export type ConnectorHealth = {
  name: "Google sign-in" | "Google Sheets" | "Google Calendar" | "Email notifications";
  state: ConnectorState;
  detail: string;
};

async function timedCheck(name: ConnectorHealth["name"], configured: boolean, check: () => Promise<unknown>): Promise<ConnectorHealth> {
  if (!configured) return { name, state: "pending", detail: "Not configured" };
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Health check timed out")), 8_000)),
    ]);
    return { name, state: "connected", detail: "Verified now" };
  } catch (error) {
    return { name, state: "error", detail: error instanceof Error ? error.message : "Connection failed" };
  }
}

export async function checkConnectorHealth(): Promise<{ checkedAt: string; connectors: ConnectorHealth[] }> {
  const [sheets, calendar, email] = await Promise.all([
    timedCheck("Google Sheets", databaseConfigured(), () => verifyDatabaseConnection()),
    timedCheck("Google Calendar", googleCalendarConfigured(), () => fetchGoogleTravelEvents(new Date())),
    (async (): Promise<ConnectorHealth> => {
      if (!emailNotificationsConfigured()) {
        return { name: "Email notifications", state: "pending", detail: "Gmail sender authorization required" };
      }
      try {
        const sender = await Promise.race([
          verifyEmailNotificationConnection(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Health check timed out")), 8_000)),
        ]);
        return { name: "Email notifications", state: "connected", detail: `Verified sender: ${sender}` };
      } catch (error) {
        return {
          name: "Email notifications",
          state: "error",
          detail: error instanceof Error ? error.message : "Connection failed",
        };
      }
    })(),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    connectors: [
      { name: "Google sign-in", state: adminAuthConfigured() ? "connected" : "pending", detail: adminAuthConfigured() ? "Configured" : "Not configured" },
      sheets,
      calendar,
      email,
    ],
  };
}
