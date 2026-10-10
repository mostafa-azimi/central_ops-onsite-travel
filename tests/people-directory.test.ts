import assert from "node:assert/strict";
import test from "node:test";
import { assertAdministratorContinuity, assertTravelerColorAvailable, dedupeManagedPeople, validateManagedPerson } from "@/lib/db";
import { TRAVELER_COLOR_OPTIONS, type ManagedPerson } from "@/lib/types";

test("people directory requires an exact ShipHero email, full name, role, and approved color", () => {
  const person = validateManagedPerson({
    email: " New.Traveler@ShipHero.com ",
    name: "New Traveler",
    isTraveler: true,
    isAdmin: false,
    color: "#3281FD",
  });
  assert.equal(person.email, "new.traveler@shiphero.com");
  assert.equal(person.color, "#3281fd");
  assert.throws(() => validateManagedPerson({ ...person, email: "person@example.com" }), /SHIPHERO_EMAIL_REQUIRED/);
  assert.throws(() => validateManagedPerson({ ...person, isTraveler: false, isAdmin: false }), /PERSON_ROLE_REQUIRED/);
  assert.throws(() => validateManagedPerson({ ...person, color: "#ffffff" }), /INVALID_PERSON_COLOR/);
});

test("the final active administrator cannot be demoted or removed", () => {
  const admin = {
    email: "mike.azimi@shiphero.com",
    name: "Mike Azimi",
    isTraveler: true,
    isAdmin: true,
    color: "#9f1d20",
    active: true,
    createdAt: "",
    updatedAt: "",
    updatedByEmail: "",
  } satisfies ManagedPerson;
  assert.throws(() => assertAdministratorContinuity(admin, false, 1), /LAST_ADMIN_REQUIRED/);
  assert.doesNotThrow(() => assertAdministratorContinuity(admin, false, 2));
});

test("the people directory returns one current record per exact email", () => {
  const original = {
    email: "mike.azimi@shiphero.com",
    name: "Mike Azimi",
    isTraveler: true,
    isAdmin: true,
    color: "#9f1d20",
    active: true,
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
    updatedByEmail: "system",
  } satisfies ManagedPerson;
  const updated = {
    ...original,
    color: "#3281fd",
    updatedAt: "2026-10-10T11:00:00.000Z",
    updatedByEmail: "mike.azimi@shiphero.com",
  };
  assert.deepEqual(dedupeManagedPeople([original, updated]), [updated]);
});

test("the directory exposes 15 approved colors and reserves each active traveler color", () => {
  assert.equal(TRAVELER_COLOR_OPTIONS.length, 15);
  assert.equal(new Set(TRAVELER_COLOR_OPTIONS.map(({ value }) => value)).size, 15);
  const existing = {
    email: "mike.azimi@shiphero.com",
    name: "Mike Azimi",
    isTraveler: true,
    isAdmin: true,
    color: "#9f1d20",
    active: true,
    createdAt: "",
    updatedAt: "",
    updatedByEmail: "",
  } satisfies ManagedPerson;
  assert.throws(() => assertTravelerColorAvailable({ ...existing, email: "new.traveler@shiphero.com" }, [existing]), /TRAVELER_COLOR_IN_USE/);
  assert.doesNotThrow(() => assertTravelerColorAvailable(existing, [existing]));
  assert.doesNotThrow(() => assertTravelerColorAvailable({ ...existing, email: "new.admin@shiphero.com", isTraveler: false }, [existing]));
});
