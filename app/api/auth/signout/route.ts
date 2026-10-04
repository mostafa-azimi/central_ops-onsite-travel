import { NextResponse } from "next/server";
import { ADMIN_COOKIE, appOrigin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/admin", appOrigin(request)));
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
