import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const revision = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  return NextResponse.json(
    { status: "ok", ...(revision ? { revision } : {}) },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
