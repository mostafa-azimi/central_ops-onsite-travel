import assert from "node:assert/strict";
import test from "node:test";
import { canApproveVisitChange } from "@/lib/change-policy";
import type { StoredVisitRequest } from "@/lib/db";

const request = {
  assignedTraveler: "Sam Armenia",
} as StoredVisitRequest;

test("only an administrator or the assigned traveler can approve requester changes", () => {
  assert.equal(canApproveVisitChange(request, "mike.azimi@shiphero.com"), true);
  assert.equal(canApproveVisitChange(request, "samuel.armenia@shiphero.com"), true);
  assert.equal(canApproveVisitChange(request, "amanda.requester@shiphero.com"), false);
  assert.equal(canApproveVisitChange(request, "rob.mcfaul@shiphero.com"), false);
});
