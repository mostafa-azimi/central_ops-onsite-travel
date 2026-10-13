import assert from "node:assert/strict";
import test from "node:test";
import {
  clearEmailTokenCacheForTests,
  requesterAndTravelerRecipients,
  sendNotificationEmail,
  verifyEmailNotificationConnection,
} from "@/lib/email-notifications";
import type { StoredVisitRequest } from "@/lib/db";

test("Gmail notifications use a narrow token exchange and ShipHero recipients", async () => {
  process.env.GOOGLE_EMAIL_CLIENT_ID = "email-client";
  process.env.GOOGLE_EMAIL_CLIENT_SECRET = "email-secret";
  process.env.GOOGLE_EMAIL_REFRESH_TOKEN = "email-refresh";
  process.env.GOOGLE_EMAIL_SENDER = "mike.azimi@shiphero.com";
  clearEmailTokenCacheForTests();
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

test("Gmail sender verification confirms a ShipHero account without sending email", async () => {
  process.env.GOOGLE_EMAIL_CLIENT_ID = "email-client";
  process.env.GOOGLE_EMAIL_CLIENT_SECRET = "email-secret";
  process.env.GOOGLE_EMAIL_REFRESH_TOKEN = "email-refresh";
  clearEmailTokenCacheForTests();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "access", expires_in: 3600 });
    return Response.json({ email: "mike.azimi@shiphero.com", email_verified: true, hd: "shiphero.com" });
  }) as typeof fetch;

  assert.equal(await verifyEmailNotificationConnection(fakeFetch), "mike.azimi@shiphero.com");
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /openidconnect\.googleapis\.com\/v1\/userinfo/);
  assert.equal(calls[1].init?.method, "GET");
});

test("email notifications reject non-ShipHero recipients", async () => {
  await assert.rejects(
    sendNotificationEmail(["outside@example.com"], "Travel request", "Body", (async () => Response.json({})) as typeof fetch),
    /EMAIL_RECIPIENT_REQUIRED/,
  );
});

test("visit updates notify both the requester and exact assigned traveler", () => {
  const request = {
    requesterEmail: "amanda@shiphero.com",
    assignedTraveler: "Sam Armenia",
  } as Pick<StoredVisitRequest, "requesterEmail" | "assignedTraveler">;
  const recipients = requesterAndTravelerRecipients(request, [
    { name: "Samuel Armenia", email: "wrong.sam@shiphero.com", color: "#3281fd" },
    { name: "Sam Armenia", email: "sam.armenia@shiphero.com", color: "#6de5a2" },
  ]);

  assert.deepEqual(recipients, ["amanda@shiphero.com", "sam.armenia@shiphero.com"]);
});

test("visit update recipients are deduplicated and never guessed by first name", () => {
  const samePerson = requesterAndTravelerRecipients(
    { requesterEmail: "rob.mcfaul@shiphero.com", assignedTraveler: "Rob McFaul" },
    [{ name: "Rob McFaul", email: "rob.mcfaul@shiphero.com", color: "#f7af2d" }],
  );
  const noExactMatch = requesterAndTravelerRecipients(
    { requesterEmail: "mike.azimi@shiphero.com", assignedTraveler: "Chris Haun" },
    [{ name: "Chris Onsite", email: "chris.onsite@shiphero.com", color: "#ef5252" }],
  );

  assert.deepEqual(samePerson, ["rob.mcfaul@shiphero.com"]);
  assert.deepEqual(noExactMatch, ["mike.azimi@shiphero.com"]);
});
