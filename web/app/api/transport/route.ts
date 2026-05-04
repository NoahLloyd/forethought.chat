import { NextResponse } from "next/server";
import { isClaudeCliAvailable } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cli = await isClaudeCliAvailable();
  return NextResponse.json({ cli });
}
