import { NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/anon-user";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/chats: list the caller's chat sessions, newest first. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ enabled: false, chats: [] });
  }
  const { id: userId } = await getOrCreateUserId();
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("chats")
    .select("id, title, updated_at, created_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json(
      { enabled: true, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ enabled: true, chats: data ?? [] });
}

type SaveBody = {
  id?: string;
  title?: string | null;
  transcript: unknown;
  mentions?: unknown;
};

/** POST /api/chats: create OR update a chat (idempotent on `id`). */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { enabled: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }
  let body: SaveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.transcript)) {
    return NextResponse.json(
      { error: "transcript must be an array" },
      { status: 400 },
    );
  }
  const { id: userId } = await getOrCreateUserId();
  const supabase = getServerSupabase();

  const row = {
    ...(body.id ? { id: body.id } : {}),
    user_id: userId,
    title: body.title?.toString().slice(0, 200) ?? null,
    transcript: body.transcript,
    mentions: Array.isArray(body.mentions) ? body.mentions : [],
  };

  const { data, error } = await supabase
    .from("chats")
    .upsert(row, { onConflict: "id" })
    .select("id, title, updated_at, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ chat: data });
}
