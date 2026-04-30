import { NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/anon-user";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/chats/[id]: load a single chat (must belong to caller). */
export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { enabled: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }
  const { id: userId } = await getOrCreateUserId();
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("chats")
    .select("id, title, transcript, mentions, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ chat: data });
}

/** DELETE /api/chats/[id]: delete a chat the caller owns. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }
  const { id: userId } = await getOrCreateUserId();
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("chats")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
