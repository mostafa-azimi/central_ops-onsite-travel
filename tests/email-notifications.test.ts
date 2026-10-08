import assert from "node:assert/strict";
import test from "node:test";
import { sendNotificationEmail } from "@/lib/email-notifications";

test("Gmail notifications use a narrow token exchange and ShipHero recipients", async () => {
  process.env.GOOGLE_EMAIL_CLIENT_ID = "email-client";
  process.env.GOOGLE_EMAIL_CLIENT_SECRET = "email-secret";
  process.env.GOOGLE_EMAIL_REFRESH_TOKEN = "email-refresh";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "access", expires_in: 3600 });
    return Response.json({ id: "message-1" });
  }) as typeof fetch;

  await sendNotificationEmail(
    ["MIKE.AZIMI@shiphero.com", "mike.azimi@shiphero.com"],
    "Travel request",
    "A request needs review.",
    fakeFetch,
  );

  assert.equal(calls.length, 2);
  const tokenBody = String(calls[0].init?.body);
  assert.match(tokenBody, /grant_type=refresh_token/);
  const sendBody = JSON.parse(String(calls[1].init?.body)) as { raw: string };
  const message = Buffer.from(sendBody.raw, "base64url").toString("utf8");
  assert.match(message, /^To: mike\.azimi@shiphero\.com/m);
  assert.match(message, /^Subject: Travel request/m);
  assert.match(message, /A request needs review\./);
});

test("email notifications reject non-ShipHero recipients", async () => {
  await assert.rejects(
    sendNotificationEmail(["outside@example.com"], "Travel request", "Body", (async () => Response.json({})) as typeof fetch),
    /EMAIL_RECIPIENT_REQUIRED/,
  );
});
