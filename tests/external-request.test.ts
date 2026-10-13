import assert from "node:assert/strict";
import test from "node:test";
import { withExternalRequestDeadline } from "@/lib/external-request";

test("external page data has a fixed deadline instead of hanging indefinitely", async () => {
  const never = new Promise<string>(() => undefined);
  await assert.rejects(withExternalRequestDeadline(never, 10), /EXTERNAL_REQUEST_TIMEOUT/);
});
