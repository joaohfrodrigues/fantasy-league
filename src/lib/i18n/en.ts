import type { Dict } from "./pt";

// English dictionary. Must match the shape of `pt` (enforced by the Dict type).
export const en: Dict = {
  langName: "EN",
  switchTo: "Português",

  common: {
    cancel: "Cancel",
    add: "Add",
    save: "Save",
    remove: "Remove",
    close: "Close",
    copy: "Copy",
    clear: "Clear all",
  },

  root: {
    metaTitle: "Fantasy Tracker",
    metaDescription:
      "Track your fantasy leagues round by round — winners, prizes, live odds and your league history.",
    notFoundTitle: "Page not found",
    notFoundBody: "The page you're looking for doesn't exist or has been moved.",
    goHome: "Go home",
    errorTitle: "This page didn't load",
    errorBody: "Something went wrong on our end. You can try refreshing or head back home.",
    tryAgain: "Try again",
    madeWithA: "Made with",
    madeWithB: "for the game in Odivelas",
  },

  landing: {
    metaTitle: "Fantasy Tracker",
    metaDescription:
      "The scoreboard for your group's fantasy league — live odds of winning, round prizes and badges. No account, just share a link.",
    brandSubtitle: "Track your fantasy leagues · Share the link · See who wins the prize",
    heroEyebrow: "Fantasy Tracker",
    heroTitleA: "Create your tracker",
    heroTitleB: "and see who eats for free",
    heroSubtitle:
      "Track your group's fantasy league round by round — live standings, each player's odds of winning the prize, and badges for the round's heroes and villains. No account: just share the link.",
    heroCta: "Create your tracker",
    heroFootnote: "* Dinner is just an example — your league can play for any prize.",

    features: {
      title: "Why use the tracker",
      simulateTitle: "Simulations for results and future scenarios",
      simulateDesc:
        "We project every remaining round to show each player's live odds of winning — and you can run what-if scenarios to see how future results would shift them.",
      prizesTitle: "Winners & prizes",
      prizesDesc: "Every round winner and prize is recorded, round by round.",
      historyTitle: "League history",
      historyDesc: "Keep a memory of your past leagues.",
    },

    example: {
      badge: "Example",
      title: "World Cup 2026",
      subtitle: "4 players · 3 rounds",
      caption: "A sample league — this is what yours looks like.",
      cta: "Create your tracker",
    },

    createTitle: "Create a league tracker",
    createSubtitle: "Name it, pick a format, and you're set — add players right on the board.",
    noSignup: "No account · Free · Just share a link",
    setupEyebrow: "Get started",
    setupTitle: "Create your league",
    setupSubtitle: "Set up your tracker in seconds, or open one that already exists.",
    leagueNameLabel: "League name",
    leagueNamePlaceholder: "World Cup 2026",
    createPasswordLabel: "Password",
    createPasswordPlaceholder: "Leave empty to auto-generate",
    createPasswordHelp: "Optional. Use 8 to 64 characters.",
    customizeLabel: "Add players & password (optional)",
    playersTitle: "Players",
    playerPlaceholder: (i: number) => `Player ${i + 1}`,
    templates: {
      title: "Format",
      subtitle: "Choose a structure for your league.",
      worldCup: { label: "World Cup", desc: "3 group matchdays + knockout" },
      championsLeague: { label: "Champions League", desc: "8 league-phase rounds + knockout" },
      league: { label: "League", desc: "Round-robin season" },
      knockout: { label: "Knockout", desc: "Single elimination" },
      leagueRoundsLabel: "Number of rounds",
      knockoutDepthLabel: "Number of rounds",
      previewLabel: "Rounds",
      matchday: (n: number) => `Matchday ${n}`,
      leagueRound: (n: number) => `Round ${n}`,
      knockoutNames: {
        r64: "Round of 64",
        r32: "Round of 32",
        r16: "Round of 16",
        qf: "Quarter-finals",
        sf: "Semi-finals",
        final: "Final",
      },
    },
    createButton: "Create tracker",

    openTitle: "Open league",
    openSubtitle: "Paste the link or the code you received.",
    openPlaceholder: "link or code",
    openAria: "Open league",

    importTitle: "Import from file",
    importSubtitle: "Create a new league from a JSON backup.",
    importButton: "Choose file",
    importErrParse: "That file isn't valid JSON.",
    importErrTooLarge: "That file is too large to be a league backup.",
    importErrVersion: "This backup was made with an unsupported version.",
    importErrInvalid: "Couldn't import this backup.",

    recentTitle: "Recent leagues",
    recentSubtitle: "Leagues you've opened on this device.",
    recentRemove: "Remove from list",

    errNoName: "Give your league a name.",
    errRounds: "Add at least 1 round.",
    errPasswordLength: "Password must be 8 to 64 characters and not too simple.",
    errRateLimited: "Too many attempts right now. Please wait a moment and try again.",
    errCreate: "Couldn't create the league. Please try again.",

    createdTitle: "League created!",
    createdReadyGenerated: "is ready. Save the password — it's shown only this once.",
    createdReadyChosen: "is ready. Your chosen password is now active for editing.",
    shareLinkLabel: "Link to share",
    passwordLabel: "Password (to edit)",
    importantLabel: "Important:",
    importantBody: "without the password, edit access cannot be recovered. Keep it somewhere safe.",
    passwordChosenLabel: "Password set:",
    passwordChosenBody: "the password you entered is now active for editing this league.",
    goToLeague: "Go to the league",
  },

  board: {
    leagueLabel: "League",
    notFoundTitle: "League not found",
    notFoundCodePrefix: "The code",
    notFoundCodeSuffix: "doesn't exist.",
    createOne: "Create a league",

    addPlayer: "Add player",
    editLeagueName: "Rename league",
    leagueNameLabel: "League name",
    leagueNamePlaceholder: "League name",
    removePlayerTitle: "Remove player",
    removePlayerConfirm: (name: string) =>
      `Remove ${name} from this league? Their scores will also be removed.`,
    addRound: "Add round",
    createRoundTitle: "Create round",
    editRoundDetails: "Edit round details",
    roundNameLabel: "Round name",
    roundNamePlaceholder: "Round name",
    roundShortLabel: "Short name",
    roundShortPlaceholder: "Short label",
    deleteRound: "Delete round",
    deleteRoundConfirm: (name: string) => `Delete ${name}? Scores in this round will be removed.`,
    lockRound: "Lock round",
    unlockRound: "Unlock round",
    lockRoundConfirm: (name: string) =>
      `Lock ${name}? Confirm the round is finished — scores can't be edited until you unlock it.`,
    roundLocked: "Locked",
    roundLockedNote: "This round is locked. Unlock it to edit scores.",
    roundsStatusLabel: "Round status",
    roundFinal: (name: string) => `${name} — final`,
    roundInProgress: (name: string) => `${name} — in progress`,
    roundUpcoming: (name: string) => `${name} — upcoming`,
    provisionalWin: "Leading — not final until the round is locked",
    editingActive: "Editing on",
    lockTitle: "Lock editing",
    editScores: "Edit scores",
    unlockTitle: "Unlock editing",

    exportData: "Export",
    exportTitle: "Download a JSON backup of this league",
    moreActions: "More actions",
    moreActionsLocked: "Unlock to access more actions.",

    whatIf: "What-if",
    whatIfTitle: "Explore hypothetical results without saving",
    whatIfActive: "What-if mode",
    whatIfBanner:
      "Hypothetical mode — these scores are never saved. The standings and odds below are simulated from them.",
    whatIfExit: "Exit",
    whatIfClearAll: "Clear all",
    whatIfClearRound: "Clear round",
    whatIfPickRound: "Round",
    whatIfNoRounds:
      "No rounds to explore yet. What-if works on rounds that haven't been played and aren't locked.",
    whatIfRoundLabel: (name: string) => `Hypothetical scores · ${name}`,

    tiebreak: "Tie-break",
    tiebreakTitle: "How players level on total points are ranked",
    tiebreakTotal: "Total points only",
    tiebreakWins: "Most round wins",
    tiebreakLatest: "Best latest round",
    tiebreakInfoTitle: "How tie-break works",
    tiebreakInfoSubtitle: "Used when players have the same total points.",
    tiebreakInfoTotal: "keeps tied players level unless another ranking signal breaks the tie.",
    tiebreakInfoWins: "puts the player with more round wins ahead.",
    tiebreakInfoLatest: "puts the player with the better most recent round ahead.",

    history: "History",
    historyTitle: "Edit history",
    historySubtitle: "Recent changes in this league.",
    historyEmpty: "No changes recorded yet.",
    historyError: "Couldn't load history.",
    historyLine: (e: {
      entityType: string;
      action: string;
      player?: string;
      round?: string;
      from?: string;
      to?: string;
    }) => {
      switch (`${e.entityType}:${e.action}`) {
        case "score:INSERT":
          return `${e.player} scored ${e.to} in ${e.round}`;
        case "score:UPDATE":
          return `${e.player} in ${e.round}: ${e.from} → ${e.to}`;
        case "score:DELETE":
          return `${e.player}'s score removed in ${e.round}`;
        case "round:INSERT":
          return `Round added: ${e.round}`;
        case "round:DELETE":
          return `Round removed: ${e.round}`;
        case "round:LOCK":
          return `Round locked: ${e.round}`;
        case "round:UNLOCK":
          return `Round unlocked: ${e.round}`;
        case "round:UPDATE":
          return `Round updated: ${e.round}`;
        case "player:INSERT":
          return `Player added: ${e.player}`;
        case "player:DELETE":
          return `Player removed: ${e.player}`;
        case "drink:UPDATE":
          return `${e.player} prize: ${e.from ?? "—"} → ${e.to ?? "—"}`;
        case "league:UPDATE":
          return `League renamed: ${e.from ?? "—"} → ${e.to ?? "—"}`;
        case "league:TIEBREAK":
          return `Tie-break rule: ${e.from ?? "—"} → ${e.to ?? "—"}`;
        default:
          return `${e.entityType} ${e.action.toLowerCase()}`;
      }
    },

    roundsPlayed: (played: number, total: number) => `${played}/${total} rounds played`,
    heroTitleA: "Who's getting",
    heroTitleB: "dinner for free",
    heroSubtitle: (remaining: number) =>
      `Live standings and the odds of winning the prize with ${remaining} ${
        remaining === 1 ? "round" : "rounds"
      } left to play.`,
    heroFootnote: "* Dinner is just an example — your league can play for any prize.",

    standings: "Standings",
    standingsSummary: (players: number, rounds: number) =>
      `${players} ${players === 1 ? "player" : "players"} · ${rounds} ${
        rounds === 1 ? "round" : "rounds"
      }`,
    roundButtonTitle: (played: boolean, name: string) => `${played ? "Edit" : "Add"} ${name}`,
    pointsButton: "Scores",

    colPlayer: "Player",
    colRoundPrizes: "Rounds won",
    colDinner: "Who takes the prize?",
    colTotal: "Total",

    winsBadgeTitle: (n: number) => `${n} ${n === 1 ? "round won" : "rounds won"}`,
    winsBadgeText: (n: number) => `${n}× ${n === 1 ? "round" : "rounds"}`,
    removePlayer: "Remove player",
    changeRoundPrizeEmoji: "Change round prize emoji",
    noPlayers: "No players yet.",
    addPlayersCta: "Add the people in your league",
    footer: "Live editing · Odds of winning the prize simulated from the rounds played so far",

    sortBy: (col: string) => `Sort by ${col}`,
    statsTitle: "Stats",
    statsHighest: "Highest score",
    statsLowest: "Lowest score",
    statsAverage: "Average score",
    statsRoundMargin: "Biggest margin",
    statsLead: "Current lead",
    statsAcross: (n: number) => `across ${n} ${n === 1 ? "score" : "scores"}`,
    statsLeadBy: (name: string) => `${name} ahead`,
    statsTied: "Tied at the top",

    dinner1: "Prize won!",
    dinner2: "Almost there!",
    dinner3: "BELIEVE IT!",
    dinner4: "Needs some luck",
    dinner5: "Footing the bill",

    infoTitle: "How the odds are calculated",
    infoSubtitle: "Monte Carlo simulation · 6000 scenarios",
    infoStep1a: "For each remaining round, every player adds their",
    infoStep1bold: "average points",
    infoStep1c: "plus some random variation.",
    infoStep2a: "We repeat this scenario",
    infoStep2bold: "thousands of times",
    infoStep2c: ". Whoever ends with the highest total wins the prize in that scenario.",
    infoStep3a: "The probability is the",
    infoStep3bold: "fraction of scenarios",
    infoStep3c: "in which each player wins.",
    infoFaq1bold: "Few rounds played?",
    infoFaq1:
      "Each player's average is pulled toward the league average, so whoever is behind still has a chance while rounds remain.",
    infoFaq2bold: "No rounds left?",
    infoFaq2: "Whoever has the most points simply wins.",

    addPlayerPlaceholder: "Name",
    addPlayersTitle: "Add players",
    playersLabel: "Players",
    errDuplicateInBatch: "You've entered the same name more than once.",
    errDuplicatePlayer: "One or more of those players already exist.",
    errTooManyPlayers: "That would exceed the player limit.",
    errAddPlayers: "Couldn't add players. Please try again.",
    badges: {
      onFire: "On Fire — won the last 2+ rounds in a row",
      onRise: "On the Rise — biggest climb this round",
      bottler: "The Bottler — biggest drop this round",
      ghost: "The Ghost — no points yet",
    },
    passwordPrompt: "Enter the league password to edit the scores.",
    passwordPlaceholder: "Password",
    passwordWrong: "Incorrect password.",
    passwordCheckFailed: "Couldn't verify password right now. Please try again in a moment.",
    passwordRateLimited: "Too many attempts. Please wait a moment before trying again.",
    unlock: "Unlock",

    roundLabel: "Round",
    points: "Points",
    clearScore: "Clear score",
  },
};
