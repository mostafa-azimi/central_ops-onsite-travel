import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { retryNotification } from "@/lib/email-notifications";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ message: "Administrator sign-in is required." }, { status: 401 });
  const { id } = await params;
  try {
    const notification = await retryNotification(id, admin.email);
    return NextResponse.json({ notification, message: "Notification sent." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "NOTIFICATION_NOT_FOUND" ? 404 : code === "INVALID_NOTIFICATION_ID" ? 400 : 502;
    return NextResponse.json({ message: code || "Notification retry failed." }, { status });
  }
}
