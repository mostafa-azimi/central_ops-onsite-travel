import assert from "node:assert/strict";
import test from "node:test";
import { canApproveVisitChange } from "@/lib/change-policy";
import type { StoredVisitRequest } from "@/lib/db";

const request = {
  assignedTraveler: "Sam Armenia",
} as StoredVisitRequest;

test("only an administrator or the assigned traveler can approve requester changes", async () => {
  assert.equal(await canApproveVisitChange(request, "mike.azimi@shiphero.com"), true);
  assert.equal(await canApproveVisitChange(request, "samuel.armenia@shiphero.com"), true);
  assert.equal(await canApproveVisitChange(request, "amanda.requester@shiphero.com"), false);
  assert.equal(await canApproveVisitChange(request, "rob.mcfaul@shiphero.com"), false);
});
