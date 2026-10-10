import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { databaseConfigured, deactivateManagedPerson, listPeopleDirectory, saveManagedPerson } from "@/lib/db";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const messages: Record<string, [string, number]> = {
    SHIPHERO_EMAIL_REQUIRED: ["Enter a valid @shiphero.com email address.", 400],
    VALID_DISPLAY_NAME_REQUIRED: ["Enter the employee's full display name.", 400],
    PERSON_ROLE_REQUIRED: ["Select traveler, administrator, or both.", 400],
    INVALID_PERSON_COLOR: ["Select one of the approved map colors.", 400],
    LAST_ADMIN_REQUIRED: ["At least one active administrator is required.", 409],
  };
  const [message, status] = messages[code] ?? ["The people directory could not be updated.", 500];
  return NextResponse.json({ message }, { status });
}

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ message: "Request storage is not configured." }, { status: 503 });
  return NextResponse.json({ people: await listPeopleDirectory() });
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ message: "Request storage is not configured." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  try {
    const person = await saveManagedPerson({
      email: String(body.email ?? ""),
      name: String(body.name ?? ""),
      isTraveler: body.isTraveler === true,
      isAdmin: body.isAdmin === true,
      color: String(body.color ?? ""),
      active: true,
    }, admin.email);
    return NextResponse.json({ person, message: "Access updated." });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ message: "Request storage is not configured." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ message: "Select a person to remove." }, { status: 400 });
  try {
    const person = await deactivateManagedPerson(email, admin.email);
    if (!person) return NextResponse.json({ message: "That person is already inactive." }, { status: 409 });
    return NextResponse.json({ person, message: "Access removed." });
  } catch (error) {
    return errorResponse(error);
  }
}
