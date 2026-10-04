import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_ADMIN_EMAIL, isAllowedAdminEmail } from "@/lib/admin-policy";

test("administrator email allowlist denies by default and matches exactly", () => {
  assert.equal(isAllowedAdminEmail(INITIAL_ADMIN_EMAIL, ""), true);
  assert.equal(isAllowedAdminEmail("MIKE.AZIMI@SHIPHERO.COM", ""), true);
  assert.equal(isAllowedAdminEmail("attacker@shiphero.com", ""), false);
  assert.equal(isAllowedAdminEmail("mike.azimi@shiphero.com.evil.test", ""), false);
});

test("additional administrators must be explicitly listed", () => {
  const configured = "approved.person@shiphero.com, second.person@shiphero.com";
  assert.equal(isAllowedAdminEmail("approved.person@shiphero.com", configured), true);
  assert.equal(isAllowedAdminEmail("unlisted.person@shiphero.com", configured), false);
});
