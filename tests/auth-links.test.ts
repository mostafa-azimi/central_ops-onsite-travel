import assert from "node:assert/strict";
import test from "node:test";
import { googleSignInErrorMessage } from "@/lib/auth-links";

test("Google sign-in errors distinguish access denial from a transient failure", () => {
  assert.equal(googleSignInErrorMessage("not_authorized"), "Use a verified @shiphero.com Google account.");
  assert.equal(googleSignInErrorMessage("sign_in_unavailable"), "Google sign-in did not finish. Please try again.");
  assert.equal(googleSignInErrorMessage("token_exchange_failed"), "Google sign-in did not finish. Please try again.");
});
