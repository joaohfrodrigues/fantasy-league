// League server functions. All mutations run on the server with the service-role
// client and verify the league's shared password first, so the browser can never
// bypass it. Reads (loading a board) happen client-side via the public anon client.
//
// IMPORTANT: server-only modules (client.server, crypto.server) are dynamic-imported
// INSIDE handlers — this file ships to the client bundle, so top-level imports of
// them would leak the service-role key / hashing code.
import { createServerFn } from "@tanstack/react-start";

const MAX_NAME = 80;
const MAX_PLAYERS = 40;
const MAX_ROUNDS = 40;
const SLUG_RETRIES = 6;

export type CreateLeagueResult = { slug: string; password: string; name: string };

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function getLeagueId(admin: AdminClient, slug: string): Promise<string> {
  const { data, error } = await admin.from("leagues").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error("DB_ERROR");
  if (!data) throw new Error("LEAGUE_NOT_FOUND");
  return data.id;
}

async function assertPassword(
  admin: AdminClient,
  leagueId: string,
  password: string,
): Promise<void> {
  const { data } = await admin
    .from("league_credentials")
    .select("password_hash, password_salt")
    .eq("league_id", leagueId)
    .maybeSingle();
  if (!data) throw new Error("WRONG_PASSWORD");
  const { verifyPassword } = await import("./crypto.server");
  const ok = await verifyPassword(password, data.password_hash, data.password_salt);
  if (!ok) throw new Error("WRONG_PASSWORD");
}

/** Verify a league + password and return the league id (throws on failure). */
async function authorize(admin: AdminClient, slug: string, password: string): Promise<string> {
  const leagueId = await getLeagueId(admin, slug);
  await assertPassword(admin, leagueId, password);
  return leagueId;
}

// --- Create league -----------------------------------------------------------

export const createLeague = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; playerNames: string[]; roundNames: string[] }) => {
    const name = clean(data?.name);
    const playerNames = dedupeNonEmpty(Array.isArray(data?.playerNames) ? data.playerNames : []);
    const roundNames = dedupeNonEmpty(Array.isArray(data?.roundNames) ? data.roundNames : []);
    if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");
    if (playerNames.length < 2 || playerNames.length > MAX_PLAYERS)
      throw new Error("INVALID_PLAYERS");
    if (roundNames.length < 1 || roundNames.length > MAX_ROUNDS) throw new Error("INVALID_ROUNDS");
    if (
      playerNames.some((n) => n.length > MAX_NAME) ||
      roundNames.some((n) => n.length > MAX_NAME)
    ) {
      throw new Error("INVALID_NAME");
    }
    return { name, playerNames, roundNames };
  })
  .handler(async ({ data }): Promise<CreateLeagueResult> => {
    const admin = await getAdmin();
    const { generateSlug, generatePassword, hashPassword } = await import("./crypto.server");

    // Find a free slug.
    let slug = "";
    for (let i = 0; i < SLUG_RETRIES; i++) {
      const candidate = generateSlug();
      const { data: existing } = await admin
        .from("leagues")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!existing) {
        slug = candidate;
        break;
      }
    }
    if (!slug) throw new Error("SLUG_GENERATION_FAILED");

    const { data: league, error: leagueErr } = await admin
      .from("leagues")
      .insert({ slug, name: data.name })
      .select("id")
      .single();
    if (leagueErr || !league) {
      console.error("[createLeague] insert league failed:", leagueErr);
      throw new Error("DB_ERROR");
    }

    const password = generatePassword();
    const { hash, salt } = await hashPassword(password);
    const { error: credErr } = await admin
      .from("league_credentials")
      .insert({ league_id: league.id, password_hash: hash, password_salt: salt });
    if (credErr) {
      console.error("[createLeague] insert credentials failed:", credErr);
      await admin.from("leagues").delete().eq("id", league.id);
      throw new Error("DB_ERROR");
    }

    const { error: playersErr } = await admin.from("players").insert(
      data.playerNames.map((name, idx) => ({
        league_id: league.id,
        name,
        display_order: idx + 1,
      })),
    );
    const { error: roundsErr } = await admin.from("rounds").insert(
      data.roundNames.map((name, idx) => ({
        league_id: league.id,
        name,
        short: String(idx + 1),
        display_order: idx + 1,
      })),
    );
    if (playersErr || roundsErr) {
      console.error("[createLeague] insert players/rounds failed:", { playersErr, roundsErr });
      await admin.from("leagues").delete().eq("id", league.id);
      throw new Error("DB_ERROR");
    }

    return { slug, password, name: data.name };
  });

// --- Verify password ----------------------------------------------------------

export const verifyLeaguePassword = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string }) => ({
    slug: clean(data?.slug),
    password: typeof data?.password === "string" ? data.password : "",
  }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const admin = await getAdmin();
    try {
      await authorize(admin, data.slug, data.password);
      return { ok: true };
    } catch (err) {
      if (err instanceof Error && err.message === "WRONG_PASSWORD") return { ok: false };
      throw err;
    }
  });

// --- Add player ---------------------------------------------------------------

export const addPlayer = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; name: string }) => {
    const name = clean(data?.name);
    if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");
    return { slug: clean(data?.slug), password: String(data?.password ?? ""), name };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    const { count } = await admin
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId);
    if ((count ?? 0) >= MAX_PLAYERS) throw new Error("TOO_MANY_PLAYERS");

    const { data: last } = await admin
      .from("players")
      .select("display_order")
      .eq("league_id", leagueId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const order = (last?.display_order ?? 0) + 1;

    const { data: inserted, error } = await admin
      .from("players")
      .insert({ league_id: leagueId, name: data.name, display_order: order })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("DUPLICATE_PLAYER");
      throw new Error("DB_ERROR");
    }
    return { id: inserted.id };
  });

// --- Remove player ------------------------------------------------------------

export const removePlayer = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; playerId: string }) => ({
    slug: clean(data?.slug),
    password: String(data?.password ?? ""),
    playerId: clean(data?.playerId),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);
    const { error } = await admin
      .from("players")
      .delete()
      .eq("id", data.playerId)
      .eq("league_id", leagueId);
    if (error) throw new Error("DB_ERROR");
    return { ok: true };
  });

// --- Set drink ----------------------------------------------------------------

export const setDrink = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; playerId: string; drink: string }) => {
    const drink = clean(data?.drink);
    if (!drink || drink.length > 8) throw new Error("INVALID_DRINK");
    return {
      slug: clean(data?.slug),
      password: String(data?.password ?? ""),
      playerId: clean(data?.playerId),
      drink,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);
    const { error } = await admin
      .from("players")
      .update({ drink: data.drink })
      .eq("id", data.playerId)
      .eq("league_id", leagueId);
    if (error) throw new Error("DB_ERROR");
    return { ok: true };
  });

// --- Save scores for a round --------------------------------------------------

export const saveScores = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      slug: string;
      password: string;
      roundId: string;
      entries: { playerId: string; points: number | null }[];
    }) => ({
      slug: clean(data?.slug),
      password: String(data?.password ?? ""),
      roundId: clean(data?.roundId),
      entries: (Array.isArray(data?.entries) ? data.entries : [])
        .map((e) => ({
          playerId: clean(e?.playerId),
          points:
            e?.points === null || e?.points === undefined || Number.isNaN(Number(e.points))
              ? null
              : Math.trunc(Number(e.points)),
        }))
        .filter((e) => e.playerId),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    // Ensure the round belongs to this league.
    const { data: round } = await admin
      .from("rounds")
      .select("id")
      .eq("id", data.roundId)
      .eq("league_id", leagueId)
      .maybeSingle();
    if (!round) throw new Error("ROUND_NOT_FOUND");

    // Only touch players that actually belong to this league.
    const { data: leaguePlayers } = await admin
      .from("players")
      .select("id")
      .eq("league_id", leagueId);
    const valid = new Set((leaguePlayers ?? []).map((p) => p.id));

    const toUpsert = data.entries
      .filter((e) => e.points !== null && valid.has(e.playerId))
      .map((e) => ({ player_id: e.playerId, round_id: data.roundId, points: e.points as number }));
    const toClear = data.entries
      .filter((e) => e.points === null && valid.has(e.playerId))
      .map((e) => e.playerId);

    if (toUpsert.length) {
      const { error } = await admin
        .from("scores")
        .upsert(toUpsert, { onConflict: "player_id,round_id" });
      if (error) throw new Error("DB_ERROR");
    }
    if (toClear.length) {
      const { error } = await admin
        .from("scores")
        .delete()
        .eq("round_id", data.roundId)
        .in("player_id", toClear);
      if (error) throw new Error("DB_ERROR");
    }
    return { ok: true };
  });
