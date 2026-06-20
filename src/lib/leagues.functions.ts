// League server functions. All mutations run on the server with the service-role
// client and verify the league's shared password first, so the browser can never
// bypass it. Reads (loading a board) happen client-side via the public anon client.
//
// IMPORTANT: server-only modules (client.server, crypto.server) are dynamic-imported
// INSIDE handlers — this file ships to the client bundle, so top-level imports of
// them would leak the service-role key / hashing code.
import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import { TIEBREAKS } from "@/lib/standings";

const MAX_NAME = 80;
const MAX_SHORT = 8;
const MAX_PLAYERS = 40;
const MAX_ROUNDS = 40;
const MIN_ROUNDS = 1;
const SLUG_RETRIES = 6;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 64;

// Per-IP burst limit (in-memory): one client can't spam creation. Note this is
// process-local, so on serverless it only bounds a single instance — the global
// hourly DB cap below is the cross-instance backstop.
const CREATE_LEAGUE_LIMIT_WINDOW_MS = 60_000;
const CREATE_LEAGUE_MAX_PER_WINDOW = 6;
// Global hourly creation backstop (DB-counted) so storage can't grow unbounded if
// the in-memory per-IP limit is bypassed or instances don't share memory. Kept
// generous so it is not a realistic growth ceiling; tune via MAX_LEAGUES_PER_HOUR.
const DEFAULT_MAX_LEAGUES_PER_HOUR = 1000;

export type CreateLeagueResult = {
  slug: string;
  password: string;
  name: string;
  generatedPassword: boolean;
};

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

type RoundInput = { name: string; short: string };

function validateRoundDetails(rawName: unknown, rawShort: unknown): RoundInput {
  const name = clean(rawName);
  const short = clean(rawShort);
  if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");
  if (short.length > MAX_SHORT) throw new Error("INVALID_ROUNDS");
  return { name, short };
}

function dedupeRounds(values: RoundInput[]): RoundInput[] {
  const seen = new Set<string>();
  const out: RoundInput[] = [];
  for (const v of values) {
    const name = typeof v?.name === "string" ? v.name.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rawShort = typeof v?.short === "string" ? v.short.trim() : "";
    out.push({ name, short: rawShort || String(out.length + 1) });
  }
  return out;
}

function isWeakPassword(password: string): boolean {
  if (!password) return false;
  const allSame = new Set(password).size <= 1;
  const numericSequence = /^\d+$/.test(password) && /^\d{8,}$/.test(password);
  return allSame || numericSequence;
}

function getEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

// Best-effort client IP for per-client rate limiting. Behind Vercel the real
// client is the first entry of x-forwarded-for. Falls back to a shared bucket
// when unavailable (still bounded by the global hourly backstop).
async function getClientIp(): Promise<string> {
  try {
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    const headers = getRequestHeaders();
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return headers.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type AuditSnapshot = {
  id: string;
  player_id: string;
  round_id: string;
  points: number;
};

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
  const { getRetryAfterMs, registerFailedAuthAttempt, clearAuthFailures } =
    await import("./rate-limit.server");
  const authLimitKey = `auth:${slug.toLowerCase()}`;
  const retryAfterMs = getRetryAfterMs(authLimitKey);
  if (retryAfterMs > 0) throw new Error("RATE_LIMITED");

  const leagueId = await getLeagueId(admin, slug);
  try {
    await assertPassword(admin, leagueId, password);
    clearAuthFailures(authLimitKey);
  } catch (err) {
    if (err instanceof Error && err.message === "WRONG_PASSWORD") {
      registerFailedAuthAttempt(authLimitKey);
    }
    throw err;
  }
  return leagueId;
}

async function writeAuditLog(
  admin: AdminClient,
  entry: {
    leagueId: string;
    entityType: string;
    action: string;
    recordId: string;
    oldValues?: Json | null;
    newValues?: Json | null;
  },
): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    league_id: entry.leagueId,
    entity_type: entry.entityType,
    action: entry.action,
    record_id: entry.recordId,
    old_values: entry.oldValues ?? null,
    new_values: entry.newValues ?? null,
  });
  if (error) throw new Error("DB_ERROR");
}

async function applyScoreUpserts(
  admin: AdminClient,
  leagueId: string,
  toUpsert: { player_id: string; round_id: string; points: number }[],
  existingByPlayer: Map<string, AuditSnapshot>,
): Promise<void> {
  if (!toUpsert.length) return;
  const { data: upserted, error } = await admin
    .from("scores")
    .upsert(toUpsert, { onConflict: "player_id,round_id" })
    .select("id, player_id, round_id, points");
  if (error) throw new Error("DB_ERROR");

  for (const score of upserted ?? []) {
    const previous = existingByPlayer.get(score.player_id) ?? null;
    await writeAuditLog(admin, {
      leagueId,
      entityType: "score",
      action: previous ? "UPDATE" : "INSERT",
      recordId: score.id,
      oldValues: previous,
      newValues: score,
    });
  }
}

async function applyScoreClears(
  admin: AdminClient,
  leagueId: string,
  roundId: string,
  toClear: string[],
  existingByPlayer: Map<string, AuditSnapshot>,
): Promise<void> {
  if (!toClear.length) return;
  for (const playerId of toClear) {
    const previous = existingByPlayer.get(playerId);
    if (!previous) continue;
    await writeAuditLog(admin, {
      leagueId,
      entityType: "score",
      action: "DELETE",
      recordId: previous.id,
      oldValues: previous,
      newValues: null,
    });
  }

  const { error } = await admin
    .from("scores")
    .delete()
    .eq("round_id", roundId)
    .in("player_id", toClear);
  if (error) throw new Error("DB_ERROR");
}

// --- Create league -----------------------------------------------------------

export const createLeague = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; playerNames: string[]; rounds: RoundInput[]; password?: string }) => {
      const name = clean(data?.name);
      const playerNames = dedupeNonEmpty(Array.isArray(data?.playerNames) ? data.playerNames : []);
      const rounds = dedupeRounds(Array.isArray(data?.rounds) ? data.rounds : []);
      const password = typeof data?.password === "string" ? data.password.trim() : "";
      if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");
      if (playerNames.length < 2 || playerNames.length > MAX_PLAYERS)
        throw new Error("INVALID_PLAYERS");
      if (rounds.length < MIN_ROUNDS || rounds.length > MAX_ROUNDS)
        throw new Error("INVALID_ROUNDS");
      if (password && (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD)) {
        throw new Error("INVALID_PASSWORD");
      }
      if (password && isWeakPassword(password)) throw new Error("INVALID_PASSWORD");
      if (
        playerNames.some((n) => n.length > MAX_NAME) ||
        rounds.some((r) => r.name.length > MAX_NAME)
      ) {
        throw new Error("INVALID_NAME");
      }
      if (rounds.some((r) => r.short.length > MAX_SHORT)) throw new Error("INVALID_ROUNDS");
      return { name, playerNames, rounds, password };
    },
  )
  .handler(async ({ data }): Promise<CreateLeagueResult> => {
    const { consumeWindowLimit } = await import("./rate-limit.server");
    // Per-IP burst limit so one client can't spam creation without throttling others.
    const ip = await getClientIp();
    const createRetryMs = consumeWindowLimit(
      `create-league:${ip}`,
      CREATE_LEAGUE_MAX_PER_WINDOW,
      CREATE_LEAGUE_LIMIT_WINDOW_MS,
    );
    if (createRetryMs > 0) throw new Error("RATE_LIMITED");

    const admin = await getAdmin();
    const { generateSlug, generatePassword, hashPassword } = await import("./crypto.server");

    // Cross-instance abuse backstop: cap creations product-wide per hour (DB-counted)
    // so storage can't grow unbounded if the per-IP limit is bypassed or instances
    // don't share memory. No fixed total ceiling — the product can grow without bound.
    const maxLeaguesPerHour = getEnvInt("MAX_LEAGUES_PER_HOUR", DEFAULT_MAX_LEAGUES_PER_HOUR);
    const oneHourAgoIso = new Date(Date.now() - 60 * 60_000).toISOString();

    const { count: hourLeagueCount, error: hourCountErr } = await admin
      .from("leagues")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneHourAgoIso);

    if (hourCountErr) throw new Error("DB_ERROR");
    if ((hourLeagueCount ?? 0) >= maxLeaguesPerHour) throw new Error("RATE_LIMITED");

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

    const generatedPassword = !data.password;
    const password = generatedPassword ? generatePassword() : data.password;
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
      data.rounds.map((r, idx) => ({
        league_id: league.id,
        name: r.name,
        short: r.short,
        display_order: idx + 1,
      })),
    );
    if (playersErr || roundsErr) {
      console.error("[createLeague] insert players/rounds failed:", { playersErr, roundsErr });
      await admin.from("leagues").delete().eq("id", league.id);
      throw new Error("DB_ERROR");
    }

    return { slug, password, name: data.name, generatedPassword };
  });

// --- Verify password ----------------------------------------------------------

export const verifyLeaguePassword = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string }) => ({
    slug: clean(data?.slug),
    password: typeof data?.password === "string" ? data.password : "",
  }))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      reason?: "WRONG_PASSWORD" | "RATE_LIMITED" | "SERVER_ERROR";
    }> => {
      const admin = await getAdmin();
      try {
        await authorize(admin, data.slug, data.password);
        return { ok: true };
      } catch (err) {
        if (err instanceof Error && err.message === "RATE_LIMITED") {
          return { ok: false, reason: "RATE_LIMITED" };
        }
        if (err instanceof Error && err.message === "WRONG_PASSWORD") {
          return { ok: false, reason: "WRONG_PASSWORD" };
        }
        console.error("[verifyLeaguePassword] verification failed:", err);
        return { ok: false, reason: "SERVER_ERROR" };
      }
    },
  );

// --- Add player ---------------------------------------------------------------

export const updateLeagueName = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; name: string }) => {
    const name = clean(data?.name);
    if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");
    return { slug: clean(data?.slug), password: String(data?.password ?? ""), name };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);
    const { data: existing } = await admin
      .from("leagues")
      .select("id, name, slug, tiebreak")
      .eq("id", leagueId)
      .maybeSingle();
    if (!existing) throw new Error("LEAGUE_NOT_FOUND");

    const { error } = await admin.from("leagues").update({ name: data.name }).eq("id", leagueId);
    if (error) throw new Error("DB_ERROR");

    await writeAuditLog(admin, {
      leagueId,
      entityType: "league",
      action: "UPDATE",
      recordId: leagueId,
      oldValues: existing,
      newValues: { ...existing, name: data.name },
    });
    return { ok: true };
  });

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
    await writeAuditLog(admin, {
      leagueId,
      entityType: "player",
      action: "INSERT",
      recordId: inserted.id,
      oldValues: null,
      newValues: { name: data.name, display_order: order },
    });
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
    const { data: existing } = await admin
      .from("players")
      .select("id, name, display_order, drink")
      .eq("id", data.playerId)
      .eq("league_id", leagueId)
      .maybeSingle();
    const { error } = await admin
      .from("players")
      .delete()
      .eq("id", data.playerId)
      .eq("league_id", leagueId);
    if (error) throw new Error("DB_ERROR");
    if (existing) {
      await writeAuditLog(admin, {
        leagueId,
        entityType: "player",
        action: "DELETE",
        recordId: existing.id,
        oldValues: existing,
        newValues: null,
      });
    }
    return { ok: true };
  });

// --- Add round ---------------------------------------------------------------

export const addRound = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; name?: string; short?: string }) => {
    const name = clean(data?.name);
    const short = clean(data?.short);
    if (name && name.length > MAX_NAME) throw new Error("INVALID_NAME");
    if (short.length > MAX_SHORT) throw new Error("INVALID_ROUNDS");
    return {
      slug: clean(data?.slug),
      password: String(data?.password ?? ""),
      name,
      short,
    };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    const { count } = await admin
      .from("rounds")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId);
    if ((count ?? 0) >= MAX_ROUNDS) throw new Error("TOO_MANY_ROUNDS");

    const { data: last } = await admin
      .from("rounds")
      .select("display_order")
      .eq("league_id", leagueId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const order = (last?.display_order ?? 0) + 1;
    const name = data.name || `Round ${order}`;

    const { data: inserted, error } = await admin
      .from("rounds")
      .insert({
        league_id: leagueId,
        name,
        short: data.short || String(order),
        display_order: order,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("DB_ERROR");
    await writeAuditLog(admin, {
      leagueId,
      entityType: "round",
      action: "INSERT",
      recordId: inserted.id,
      oldValues: null,
      newValues: { name, short: data.short || String(order), display_order: order },
    });
    return { id: inserted.id };
  });

export const updateRound = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { slug: string; password: string; roundId: string; name: string; short: string }) => {
      const { name, short } = validateRoundDetails(data?.name, data?.short);
      return {
        slug: clean(data?.slug),
        password: String(data?.password ?? ""),
        roundId: clean(data?.roundId),
        name,
        short,
      };
    },
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    const { data: existing } = await admin
      .from("rounds")
      .select("id, name, short, display_order, locked_at")
      .eq("id", data.roundId)
      .eq("league_id", leagueId)
      .maybeSingle();
    if (!existing) throw new Error("ROUND_NOT_FOUND");

    const { error } = await admin
      .from("rounds")
      .update({ name: data.name, short: data.short })
      .eq("id", data.roundId)
      .eq("league_id", leagueId);
    if (error) throw new Error("DB_ERROR");

    await writeAuditLog(admin, {
      leagueId,
      entityType: "round",
      action: "UPDATE",
      recordId: existing.id,
      oldValues: existing,
      newValues: { ...existing, name: data.name, short: data.short },
    });
    return { ok: true };
  });

// --- Delete round ------------------------------------------------------------

export const deleteRound = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; roundId: string }) => ({
    slug: clean(data?.slug),
    password: String(data?.password ?? ""),
    roundId: clean(data?.roundId),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    const { count } = await admin
      .from("rounds")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId);
    if ((count ?? 0) <= MIN_ROUNDS) throw new Error("MIN_ROUNDS");

    const { data: target } = await admin
      .from("rounds")
      .select("id, name, short, display_order, locked_at")
      .eq("id", data.roundId)
      .eq("league_id", leagueId)
      .maybeSingle();
    if (!target) throw new Error("ROUND_NOT_FOUND");

    const { error: deleteErr } = await admin
      .from("rounds")
      .delete()
      .eq("id", data.roundId)
      .eq("league_id", leagueId);
    if (deleteErr) throw new Error("DB_ERROR");

    await writeAuditLog(admin, {
      leagueId,
      entityType: "round",
      action: "DELETE",
      recordId: target.id,
      oldValues: target,
      newValues: null,
    });

    const { data: remaining, error: listErr } = await admin
      .from("rounds")
      .select("id, display_order")
      .eq("league_id", leagueId)
      .order("display_order", { ascending: true });
    if (listErr) throw new Error("DB_ERROR");

    for (let i = 0; i < (remaining ?? []).length; i++) {
      const nextOrder = i + 1;
      const row = remaining?.[i];
      if (!row || row.display_order === nextOrder) continue;
      const { error: reorderErr } = await admin
        .from("rounds")
        .update({ display_order: nextOrder })
        .eq("id", row.id)
        .eq("league_id", leagueId);
      if (reorderErr) throw new Error("DB_ERROR");
    }

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
    const { data: existing } = await admin
      .from("players")
      .select("id, drink")
      .eq("id", data.playerId)
      .eq("league_id", leagueId)
      .maybeSingle();
    const { error } = await admin
      .from("players")
      .update({ drink: data.drink })
      .eq("id", data.playerId)
      .eq("league_id", leagueId);
    if (error) throw new Error("DB_ERROR");
    await writeAuditLog(admin, {
      leagueId,
      entityType: "drink",
      action: "UPDATE",
      recordId: data.playerId,
      oldValues: existing ? { drink: existing.drink } : null,
      newValues: { drink: data.drink },
    });
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
      .select("id, locked_at")
      .eq("id", data.roundId)
      .eq("league_id", leagueId)
      .maybeSingle();
    if (!round) throw new Error("ROUND_NOT_FOUND");
    if (round.locked_at) throw new Error("ROUND_LOCKED");

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

    const touchedPlayerIds = [...new Set([...toUpsert.map((e) => e.player_id), ...toClear])];
    const { data: existingScores, error: existingScoresError } = touchedPlayerIds.length
      ? await admin
          .from("scores")
          .select("id, player_id, round_id, points")
          .eq("round_id", data.roundId)
          .in("player_id", touchedPlayerIds)
      : { data: [] as AuditSnapshot[], error: null };
    if (existingScoresError) throw new Error("DB_ERROR");

    const existingByPlayer = new Map(
      (existingScores ?? []).map((score) => [score.player_id, score]),
    );

    await applyScoreUpserts(admin, leagueId, toUpsert, existingByPlayer);
    await applyScoreClears(admin, leagueId, data.roundId, toClear, existingByPlayer);
    return { ok: true };
  });

// --- Lock / unlock a round ----------------------------------------------------

async function setRoundLock(
  slug: string,
  password: string,
  roundId: string,
  lock: boolean,
): Promise<{ ok: true }> {
  const admin = await getAdmin();
  const leagueId = await authorize(admin, slug, password);

  const { data: round } = await admin
    .from("rounds")
    .select("id, locked_at")
    .eq("id", roundId)
    .eq("league_id", leagueId)
    .maybeSingle();
  if (!round) throw new Error("ROUND_NOT_FOUND");

  const lockedAt = lock ? new Date().toISOString() : null;
  const { error } = await admin
    .from("rounds")
    .update({ locked_at: lockedAt })
    .eq("id", roundId)
    .eq("league_id", leagueId);
  if (error) throw new Error("DB_ERROR");

  await writeAuditLog(admin, {
    leagueId,
    entityType: "round",
    action: lock ? "LOCK" : "UNLOCK",
    recordId: roundId,
    oldValues: { locked_at: round.locked_at },
    newValues: { locked_at: lockedAt },
  });

  return { ok: true };
}

export const lockRound = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; roundId: string }) => ({
    slug: clean(data?.slug),
    password: String(data?.password ?? ""),
    roundId: clean(data?.roundId),
  }))
  .handler(
    async ({ data }): Promise<{ ok: true }> =>
      setRoundLock(data.slug, data.password, data.roundId, true),
  );

export const unlockRound = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; roundId: string }) => ({
    slug: clean(data?.slug),
    password: String(data?.password ?? ""),
    roundId: clean(data?.roundId),
  }))
  .handler(
    async ({ data }): Promise<{ ok: true }> =>
      setRoundLock(data.slug, data.password, data.roundId, false),
  );

// --- League tie-break rule -----------------------------------------------------

/** Update the league's tie-break rule (requires the password). */
export const updateTiebreak = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; tiebreak: string }) => {
    const tiebreak = clean(data?.tiebreak);
    if (!(TIEBREAKS as readonly string[]).includes(tiebreak)) throw new Error("INVALID_TIEBREAK");
    return {
      slug: clean(data?.slug),
      password: String(data?.password ?? ""),
      tiebreak,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    const { data: current } = await admin
      .from("leagues")
      .select("tiebreak")
      .eq("id", leagueId)
      .maybeSingle();

    const { error } = await admin
      .from("leagues")
      .update({ tiebreak: data.tiebreak })
      .eq("id", leagueId);
    if (error) throw new Error("DB_ERROR");

    await writeAuditLog(admin, {
      leagueId,
      entityType: "league",
      action: "TIEBREAK",
      recordId: leagueId,
      oldValues: { tiebreak: current?.tiebreak ?? "total" },
      newValues: { tiebreak: data.tiebreak },
    });

    return { ok: true };
  });

// --- Read audit history -------------------------------------------------------

export type AuditEntry = {
  id: string;
  entityType: string;
  action: string;
  recordId: string;
  oldValues: Json | null;
  newValues: Json | null;
  changedAt: string;
};

const AUDIT_PAGE_SIZE = 50;
const AUDIT_MAX_LIMIT = 200;

export const getAuditLog = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string; limit?: number }) => {
    const rawLimit = Number(data?.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.trunc(rawLimit), AUDIT_MAX_LIMIT)
        : AUDIT_PAGE_SIZE;
    return {
      slug: clean(data?.slug),
      password: String(data?.password ?? ""),
      limit,
    };
  })
  .handler(async ({ data }): Promise<{ entries: AuditEntry[] }> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    const { data: rows, error } = await admin
      .from("audit_log")
      .select("id, entity_type, action, record_id, old_values, new_values, changed_at")
      .eq("league_id", leagueId)
      .order("changed_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error("DB_ERROR");

    const entries: AuditEntry[] = (rows ?? []).map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      action: row.action,
      recordId: row.record_id,
      oldValues: row.old_values,
      newValues: row.new_values,
      changedAt: row.changed_at,
    }));
    return { entries };
  });

// --- Export / import (JSON snapshot) ------------------------------------------

export const SNAPSHOT_VERSION = 1;
const MAX_DRINK = 8;
const POINTS_MIN = -10000;
const POINTS_MAX = 100000;
// A valid league has at most one score per (player, round) pair, so this is the
// hard ceiling on snapshot scores. Used to reject oversized arrays up front,
// before any O(n) parsing work runs on attacker-controlled input.
const MAX_SCORES = MAX_PLAYERS * MAX_ROUNDS;

export type LeagueSnapshot = {
  version: number;
  exportedAt: string;
  league: { name: string };
  players: { name: string; drink: string }[];
  rounds: { name: string; short: string }[];
  scores: { player: number; round: number; points: number }[];
};

/** Build a portable, versioned JSON snapshot of a league (requires the password). */
export const exportLeague = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; password: string }) => ({
    slug: clean(data?.slug),
    password: String(data?.password ?? ""),
  }))
  .handler(async ({ data }): Promise<LeagueSnapshot> => {
    const admin = await getAdmin();
    const leagueId = await authorize(admin, data.slug, data.password);

    const { data: league, error: leagueErr } = await admin
      .from("leagues")
      .select("name")
      .eq("id", leagueId)
      .single();
    if (leagueErr || !league) throw new Error("DB_ERROR");

    const { data: players, error: playersErr } = await admin
      .from("players")
      .select("id, name, drink, display_order")
      .eq("league_id", leagueId)
      .order("display_order", { ascending: true });
    if (playersErr) throw new Error("DB_ERROR");

    const { data: rounds, error: roundsErr } = await admin
      .from("rounds")
      .select("id, name, short, display_order")
      .eq("league_id", leagueId)
      .order("display_order", { ascending: true });
    if (roundsErr) throw new Error("DB_ERROR");

    const playerIndex = new Map((players ?? []).map((p, idx) => [p.id, idx]));
    const roundIndex = new Map((rounds ?? []).map((r, idx) => [r.id, idx]));
    const playerIds = [...playerIndex.keys()];

    const { data: scores, error: scoresErr } = playerIds.length
      ? await admin.from("scores").select("player_id, round_id, points").in("player_id", playerIds)
      : { data: [] as { player_id: string; round_id: string; points: number }[], error: null };
    if (scoresErr) throw new Error("DB_ERROR");

    const snapshotScores: LeagueSnapshot["scores"] = [];
    for (const s of scores ?? []) {
      const player = playerIndex.get(s.player_id);
      const round = roundIndex.get(s.round_id);
      if (player === undefined || round === undefined) continue;
      snapshotScores.push({ player, round, points: s.points });
    }

    return {
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      league: { name: league.name },
      players: (players ?? []).map((p) => ({ name: p.name, drink: p.drink })),
      rounds: (rounds ?? []).map((r) => ({ name: r.name, short: r.short })),
      scores: snapshotScores,
    };
  });

type ParsedSnapshot = {
  name: string;
  players: { name: string; drink: string }[];
  rounds: { name: string; short: string }[];
  scores: { player: number; round: number; points: number }[];
  password: string;
};

function parsePlayers(raw: unknown[]): { name: string; drink: string }[] {
  const seen = new Set<string>();
  const players: { name: string; drink: string }[] = [];
  for (const item of raw) {
    const p = (item ?? {}) as Record<string, unknown>;
    const name = clean(p.name);
    if (!name || name.length > MAX_NAME) throw new Error("INVALID_SNAPSHOT");
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error("INVALID_SNAPSHOT");
    seen.add(key);
    const drinkRaw = clean(p.drink);
    const drink = drinkRaw.slice(0, MAX_DRINK) || "🍺";
    players.push({ name, drink });
  }
  if (players.length < 2 || players.length > MAX_PLAYERS) throw new Error("INVALID_SNAPSHOT");
  return players;
}

function parseRounds(raw: unknown[]): { name: string; short: string }[] {
  const seen = new Set<string>();
  const rounds: { name: string; short: string }[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const name = clean(r.name);
    if (!name || name.length > MAX_NAME) throw new Error("INVALID_SNAPSHOT");
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error("INVALID_SNAPSHOT");
    seen.add(key);
    const shortRaw = clean(r.short);
    if (shortRaw.length > MAX_SHORT) throw new Error("INVALID_SNAPSHOT");
    rounds.push({ name, short: shortRaw || String(rounds.length + 1) });
  }
  if (rounds.length < MIN_ROUNDS || rounds.length > MAX_ROUNDS) throw new Error("INVALID_SNAPSHOT");
  return rounds;
}

function parseScores(
  raw: unknown[],
  playerCount: number,
  roundCount: number,
): { player: number; round: number; points: number }[] {
  const scores: { player: number; round: number; points: number }[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = (item ?? {}) as Record<string, unknown>;
    const player = Number(s.player);
    const round = Number(s.round);
    const points = Number(s.points);
    if (!Number.isInteger(player) || player < 0 || player >= playerCount)
      throw new Error("INVALID_SNAPSHOT");
    if (!Number.isInteger(round) || round < 0 || round >= roundCount)
      throw new Error("INVALID_SNAPSHOT");
    if (!Number.isFinite(points)) throw new Error("INVALID_SNAPSHOT");
    const key = `${player}:${round}`;
    if (seen.has(key)) throw new Error("INVALID_SNAPSHOT");
    seen.add(key);
    const clamped = Math.max(POINTS_MIN, Math.min(POINTS_MAX, Math.trunc(points)));
    scores.push({ player, round, points: clamped });
  }
  return scores;
}

/** Create a brand-new league from a JSON snapshot. Does not touch existing leagues. */
export const importLeague = createServerFn({ method: "POST" })
  .inputValidator((data: { snapshot: unknown; password?: string }): ParsedSnapshot => {
    const snap = (data?.snapshot ?? null) as Record<string, unknown> | null;
    if (!snap || typeof snap !== "object") throw new Error("INVALID_SNAPSHOT");

    const version = Number(snap.version);
    if (!Number.isFinite(version) || version < 1 || version > SNAPSHOT_VERSION)
      throw new Error("UNSUPPORTED_VERSION");

    const leagueObj = (snap.league ?? {}) as Record<string, unknown>;
    const name = clean(leagueObj.name);
    if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");

    const rawPlayers = Array.isArray(snap.players) ? snap.players : [];
    const rawRounds = Array.isArray(snap.rounds) ? snap.rounds : [];
    const rawScores = Array.isArray(snap.scores) ? snap.scores : [];
    // Reject oversized input before the per-item loops run: array `.length` is
    // O(1), so a malicious 10M-element array is refused immediately instead of
    // being fully iterated.
    if (
      rawPlayers.length > MAX_PLAYERS ||
      rawRounds.length > MAX_ROUNDS ||
      rawScores.length > MAX_SCORES
    ) {
      throw new Error("INVALID_SNAPSHOT");
    }

    const players = parsePlayers(rawPlayers);
    const rounds = parseRounds(rawRounds);
    const scores = parseScores(rawScores, players.length, rounds.length);

    const password = typeof data?.password === "string" ? data.password.trim() : "";
    if (password && (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD))
      throw new Error("INVALID_PASSWORD");

    return { name, players, rounds, scores, password };
  })
  .handler(async ({ data }): Promise<CreateLeagueResult> => {
    const admin = await getAdmin();
    const { generateSlug, generatePassword, hashPassword } = await import("./crypto.server");

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
      console.error("[importLeague] insert league failed:", leagueErr);
      throw new Error("DB_ERROR");
    }

    const generatedPassword = !data.password;
    const password = generatedPassword ? generatePassword() : data.password;
    const { hash, salt } = await hashPassword(password);
    const { error: credErr } = await admin
      .from("league_credentials")
      .insert({ league_id: league.id, password_hash: hash, password_salt: salt });
    if (credErr) {
      console.error("[importLeague] insert credentials failed:", credErr);
      await admin.from("leagues").delete().eq("id", league.id);
      throw new Error("DB_ERROR");
    }

    const { data: insertedPlayers, error: playersErr } = await admin
      .from("players")
      .insert(
        data.players.map((p, idx) => ({
          league_id: league.id,
          name: p.name,
          drink: p.drink,
          display_order: idx + 1,
        })),
      )
      .select("id, display_order");
    const { data: insertedRounds, error: roundsErr } = await admin
      .from("rounds")
      .insert(
        data.rounds.map((r, idx) => ({
          league_id: league.id,
          name: r.name,
          short: r.short,
          display_order: idx + 1,
        })),
      )
      .select("id, display_order");
    if (playersErr || roundsErr || !insertedPlayers || !insertedRounds) {
      console.error("[importLeague] insert players/rounds failed:", { playersErr, roundsErr });
      await admin.from("leagues").delete().eq("id", league.id);
      throw new Error("DB_ERROR");
    }

    if (data.scores.length) {
      const playerIdByIndex = new Map(insertedPlayers.map((p) => [p.display_order - 1, p.id]));
      const roundIdByIndex = new Map(insertedRounds.map((r) => [r.display_order - 1, r.id]));
      const scoreRows = data.scores
        .map((s) => {
          const playerId = playerIdByIndex.get(s.player);
          const roundId = roundIdByIndex.get(s.round);
          if (!playerId || !roundId) return null;
          return { player_id: playerId, round_id: roundId, points: s.points };
        })
        .filter(
          (row): row is { player_id: string; round_id: string; points: number } => row !== null,
        );

      if (scoreRows.length) {
        const { error: scoresErr } = await admin.from("scores").insert(scoreRows);
        if (scoresErr) {
          console.error("[importLeague] insert scores failed:", scoresErr);
          await admin.from("leagues").delete().eq("id", league.id);
          throw new Error("DB_ERROR");
        }
      }
    }

    return { slug, password, name: data.name, generatedPassword };
  });
