import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const banterInputSchema = z.object({
  leagueId: z.string(),
  roundId: z.string(),
  leagueName: z.string(),
  roundName: z.string(),
  roundWinner: z.string().nullable(),
  leader: z.string().nullable(),
  lastPlace: z.string().nullable(),
  badges: z.array(z.object({ player: z.string(), badges: z.array(z.string()) })),
  playerCount: z.number(),
  roundsPlayed: z.number(),
  totalRounds: z.number(),
});

export const getBanterLine = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => banterInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { getBanter } = await import("@/lib/banter.server");
    return getBanter(data as Parameters<typeof getBanter>[0]);
  });
