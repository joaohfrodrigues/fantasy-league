import { hashPassword } from "../../src/lib/crypto.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

const MIN_PASSWORD = 4;
const MAX_PASSWORD = 8;

type Args = {
  slug?: string;
  id?: string;
  password?: string;
  help?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--slug") {
      args.slug = argv[i + 1];
      i++;
      continue;
    }
    if (arg === "--id") {
      args.id = argv[i + 1];
      i++;
      continue;
    }
    if (arg === "--password") {
      args.password = argv[i + 1];
      i++;
    }
  }
  return args;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function printUsage(): void {
  console.log("Change a league password (admin operation).");
  console.log("");
  console.log("Usage:");
  console.log("  bun run admin:change-password -- --slug <league-slug> --password <new-password>");
  console.log("  bun run admin:change-password -- --id <league-uuid> --password <new-password>");
  console.log("");
  console.log("Rules:");
  console.log(`  - Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`);
  console.log("  - Provide exactly one identifier: --slug OR --id.");
}

async function resolveLeagueId(args: Args): Promise<{ id: string; slug: string; name: string }> {
  if (args.id) {
    const id = args.id.trim();
    if (!isUuid(id)) throw new Error("INVALID_ID");

    const { data, error } = await supabaseAdmin
      .from("leagues")
      .select("id, slug, name")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("DB_ERROR");
    if (!data) throw new Error("LEAGUE_NOT_FOUND");
    return data;
  }

  if (!args.slug) throw new Error("MISSING_IDENTIFIER");
  const slug = args.slug.trim();
  if (!slug) throw new Error("INVALID_SLUG");

  const { data, error } = await supabaseAdmin
    .from("leagues")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("DB_ERROR");
  if (!data) throw new Error("LEAGUE_NOT_FOUND");
  return data;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const identifiers = Number(Boolean(args.slug)) + Number(Boolean(args.id));
  if (identifiers !== 1) throw new Error("ONE_IDENTIFIER_REQUIRED");

  const rawPassword = typeof args.password === "string" ? args.password.trim() : "";
  if (!rawPassword) throw new Error("MISSING_PASSWORD");
  if (rawPassword.length < MIN_PASSWORD || rawPassword.length > MAX_PASSWORD) {
    throw new Error("INVALID_PASSWORD");
  }

  const league = await resolveLeagueId(args);
  const { hash, salt } = await hashPassword(rawPassword);

  const { data: updated, error } = await supabaseAdmin
    .from("league_credentials")
    .update({ password_hash: hash, password_salt: salt })
    .eq("league_id", league.id)
    .select("league_id")
    .maybeSingle();

  if (error) throw new Error("DB_ERROR");
  if (!updated) throw new Error("CREDENTIALS_NOT_FOUND");

  console.log(`Password updated for league "${league.name}" (${league.slug}) [${league.id}].`);
}

try {
  await main();
} catch (err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN_ERROR";

  switch (code) {
    case "ONE_IDENTIFIER_REQUIRED":
      console.error("Provide exactly one identifier: --slug or --id.");
      break;
    case "MISSING_IDENTIFIER":
      console.error("Missing league identifier. Use --slug or --id.");
      break;
    case "INVALID_ID":
      console.error("Invalid league id format. Expected UUID.");
      break;
    case "INVALID_SLUG":
      console.error("Invalid slug. It cannot be empty.");
      break;
    case "MISSING_PASSWORD":
      console.error("Missing password. Provide --password <value>.");
      break;
    case "INVALID_PASSWORD":
      console.error(`Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`);
      break;
    case "LEAGUE_NOT_FOUND":
      console.error("League not found.");
      break;
    case "CREDENTIALS_NOT_FOUND":
      console.error("League credentials record not found.");
      break;
    case "DB_ERROR":
      console.error("Database error while updating the password.");
      break;
    default:
      console.error("Unexpected error while changing the password.");
      if (err instanceof Error) console.error(err.stack ?? err.message);
      break;
  }

  process.exit(1);
}
