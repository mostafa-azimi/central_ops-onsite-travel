import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/health/route";

test("health endpoint reports readiness without exposing configuration", async () => {
  const previousRevision = process.env.RAILWAY_GIT_COMMIT_SHA;
  process.env.RAILWAY_GIT_COMMIT_SHA = "abc123";
  const response = GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok", revision: "abc123" });
  if (previousRevision === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
  else process.env.RAILWAY_GIT_COMMIT_SHA = previousRevision;
});
