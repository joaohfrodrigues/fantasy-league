// Client-only: shares a round's recap PNG (see og-middleware.server.ts's
// /api/recap/:slug/:roundId) via the native share sheet, falling back to
// opening the image in a new tab. Shared by the round editor and the live
// board's AI-summary strip so both share affordances stay in sync.
export async function shareRoundRecap(slug: string, roundId: string, title: string): Promise<void> {
  const recapUrl = `${window.location.origin}/api/recap/${slug}/${roundId}`;
  try {
    if (typeof navigator !== "undefined" && "canShare" in navigator) {
      const blob = await fetch(recapUrl).then((r) => r.blob());
      const file = new File([blob], "round-recap.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    }
  } catch {
    // fall through
  }
  window.open(recapUrl, "_blank");
}
