import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/app/api/auth/google/start/route";

test("Google sign-in creates OAuth state only on the canonical app origin", async () => {
  const prior = {
    appOrigin: process.env.APP_ORIGIN,
    clientId: process.env.GOOGLE_OIDC_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET,
  };
  process.env.APP_ORIGIN = "https://central-ops-travel-hub.vercel.app";
  process.env.GOOGLE_OIDC_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_OIDC_CLIENT_SECRET = "test-client-secret";

  try {
    const staleAlias = await GET(new Request("https://cs-onsite-travel.vercel.app/api/auth/google/start?returnTo=%2Fmap"));
    assert.equal(staleAlias.status, 307);
    assert.equal(staleAlias.headers.get("location"), "https://central-ops-travel-hub.vercel.app/api/auth/google/start?returnTo=%2Fmap");
    assert.equal(staleAlias.headers.get("set-cookie"), null);

    const canonical = await GET(new Request("https://central-ops-travel-hub.vercel.app/api/auth/google/start?returnTo=%2Fmap"));
    assert.equal(canonical.status, 307);
    const authorizationUrl = new URL(canonical.headers.get("location")!);
    assert.equal(authorizationUrl.origin, "https://accounts.google.com");
    assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "https://central-ops-travel-hub.vercel.app/api/auth/google/callback");
    assert.equal(authorizationUrl.searchParams.get("client_id"), "test-client-id");
    assert.ok(authorizationUrl.searchParams.get("state"));
    const cookies = canonical.headers.get("set-cookie") ?? "";
    assert.match(cookies, /central_ops_oauth_state=/);
    assert.match(cookies, /central_ops_oauth_verifier=/);
    assert.match(cookies, /central_ops_oauth_return=%2Fmap/);

    process.env.APP_ORIGIN = "https://central-ops-travel.aiherolabs.xyz";
    const railwayProxy = await GET(new Request("http://0.0.0.0:3000/api/auth/google/start?returnTo=%2Fadmin", {
      headers: {
        host: "0.0.0.0:3000",
        "x-forwarded-host": "central-ops-travel.aiherolabs.xyz",
        "x-forwarded-proto": "https",
      },
    }));
    assert.equal(railwayProxy.status, 307);
    const railwayAuthorizationUrl = new URL(railwayProxy.headers.get("location")!);
    assert.equal(railwayAuthorizationUrl.origin, "https://accounts.google.com");
    assert.equal(railwayAuthorizationUrl.searchParams.get("redirect_uri"), "https://central-ops-travel.aiherolabs.xyz/api/auth/google/callback");
    assert.match(railwayProxy.headers.get("set-cookie") ?? "", /central_ops_oauth_state=/);
  } finally {
    if (prior.appOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = prior.appOrigin;
    if (prior.clientId === undefined) delete process.env.GOOGLE_OIDC_CLIENT_ID;
    else process.env.GOOGLE_OIDC_CLIENT_ID = prior.clientId;
    if (prior.clientSecret === undefined) delete process.env.GOOGLE_OIDC_CLIENT_SECRET;
    else process.env.GOOGLE_OIDC_CLIENT_SECRET = prior.clientSecret;
  }
});
