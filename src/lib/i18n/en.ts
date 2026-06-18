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
  },

  root: {
    metaTitle: "Fantasy League",
    metaDescription: "Create your fantasy league and see who gets dinner for free.",
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
    metaTitle: "Fantasy League tracker",
    metaDescription: "Create your fantasy league. Who's going to win dinner?",
    brandSubtitle: "Create your league · share the link · see who gets dinner for free",
    heroEyebrow: "Your own fantasy league",
    heroTitleA: "Create your league",
    heroTitleB: "and see who gets dinner for free",
    heroSubtitle:
      "Set up the players and rounds. You get a link to share and a password to edit the scores. Live standings and the odds of winning dinner.",

    createTitle: "Create league",
    createSubtitle: "Set the name, the players and the rounds.",
    leagueNameLabel: "League name",
    leagueNamePlaceholder: "Friends League",
    playersTitle: "Players",
    playerPlaceholder: (i: number) => `Player ${i + 1}`,
    roundsTitle: "Rounds",
    roundPlaceholder: (i: number) => `Round ${i + 1}`,
    defaultRounds: [
      "Round 1",
      "Round 2",
      "Round 3",
      "Round of 32",
      "Round of 16",
      "Quarter-finals",
      "Semi-finals",
      "Final",
    ],
    createButton: "Create league",

    openTitle: "Open league",
    openSubtitle: "Paste the link or the code you received.",
    openPlaceholder: "link or code",
    openAria: "Open league",

    recentTitle: "Recent leagues",
    recentSubtitle: "Leagues you've opened on this device.",
    recentRemove: "Remove from list",

    errNoName: "Give your league a name.",
    errPlayers: "Add at least 2 players.",
    errRounds: "Add at least 1 round.",
    errCreate: "Couldn't create the league. Please try again.",

    createdTitle: "League created!",
    createdReady: "is ready. Save the password — it's shown only this once.",
    shareLinkLabel: "Link to share",
    passwordLabel: "Password (to edit)",
    importantLabel: "Important:",
    importantBody: "without the password, edit access cannot be recovered. Keep it somewhere safe.",
    goToLeague: "Go to the league",
  },

  board: {
    leagueLabel: "League",
    notFoundTitle: "League not found",
    notFoundCodePrefix: "The code",
    notFoundCodeSuffix: "doesn't exist.",
    createOne: "Create a league",

    addPlayer: "Add player",
    editingActive: "Editing on",
    lockTitle: "Lock editing",
    editScores: "Edit scores",
    unlockTitle: "Unlock editing",

    roundsPlayed: (played: number, total: number) => `${played}/${total} rounds played`,
    heroTitleA: "Who's getting",
    heroTitleB: "dinner for free",
    heroSubtitle: (remaining: number) =>
      `Live standings and the odds of winning dinner with ${remaining} ${
        remaining === 1 ? "round" : "rounds"
      } left to play.`,

    standings: "Standings",
    standingsSummary: (players: number, rounds: number) =>
      `${players} ${players === 1 ? "player" : "players"} · ${rounds} ${
        rounds === 1 ? "round" : "rounds"
      }`,
    roundButtonTitle: (played: boolean, name: string) => `${played ? "Edit" : "Add"} ${name}`,
    pointsButton: "Scores",

    colPlayer: "Player",
    colDrinks: "Drinks",
    colDinner: "Dinner paid",
    colTotal: "Total",

    winsBadgeTitle: (n: number) => `${n} ${n === 1 ? "round won" : "rounds won"}`,
    winsBadgeText: (n: number) => `${n}× ${n === 1 ? "round" : "rounds"}`,
    removePlayer: "Remove player",
    changeDrink: "Change drink",
    noPlayers: "No players yet.",
    footer: "Live editing · odds of winning dinner simulated from the rounds played so far",

    dinner1: "Dinner paid!",
    dinner2: "Smelling the dinner",
    dinner3: "BELIEVE IT!",
    dinner4: "Needs some luck",
    dinner5: "Footing the bill",

    infoTitle: "How the odds are calculated",
    infoSubtitle: "Monte Carlo simulation · 4000 scenarios",
    infoStep1a: "For each remaining round, every player adds their",
    infoStep1bold: "average points",
    infoStep1c: "plus some random variation.",
    infoStep2a: "We repeat this scenario",
    infoStep2bold: "thousands of times",
    infoStep2c: ". Whoever ends with the highest total wins dinner in that scenario.",
    infoStep3a: "The probability is the",
    infoStep3bold: "fraction of scenarios",
    infoStep3c: "in which each player wins.",
    infoFaq1bold: "Few rounds played?",
    infoFaq1:
      "Each player's average is pulled toward the league average, so whoever is behind still has a chance while rounds remain.",
    infoFaq2bold: "No rounds left?",
    infoFaq2: "Whoever has the most points simply wins.",

    addPlayerPlaceholder: "Name",
    passwordPrompt: "Enter the league password to edit the scores.",
    passwordPlaceholder: "Password",
    passwordWrong: "Incorrect password.",
    unlock: "Unlock",

    roundLabel: "Round",
    points: "Points",
  },
};
