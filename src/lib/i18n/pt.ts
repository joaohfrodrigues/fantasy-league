// Portuguese dictionary. This is the source of truth for the dictionary shape;
// the English dictionary (en.ts) must match this structure (enforced via the Dict type).

export const pt = {
  langName: "PT",
  switchTo: "English",

  common: {
    cancel: "Cancelar",
    add: "Adicionar",
    save: "Guardar",
    remove: "Remover",
    close: "Fechar",
    copy: "Copiar",
  },

  root: {
    metaTitle: "Fantasy League",
    metaDescription: "Cria a tua liga fantasy e vê quem janta à pala.",
    notFoundTitle: "Página não encontrada",
    notFoundBody: "A página que procuras não existe ou foi movida.",
    goHome: "Voltar ao início",
    errorTitle: "Esta página não carregou",
    errorBody: "Algo correu mal do nosso lado. Tenta atualizar ou volta ao início.",
    tryAgain: "Tentar de novo",
    madeWithA: "Feito com",
    madeWithB: "ao jogo em Odivelas",
  },

  landing: {
    metaTitle: "Fantasy League tracker",
    metaDescription: "Cria a tua liga fantasy. Quem vai ganhar o jantar?",
    brandSubtitle: "Cria a tua liga · partilha o link · vê quem janta à pala",
    heroEyebrow: "A tua própria liga fantasy",
    heroTitleA: "Cria a tua liga",
    heroTitleB: "e vê quem janta à pala",
    heroSubtitle:
      "Define os jogadores e as rondas. Recebes um link para partilhar e uma palavra-passe para editar os pontos. Classificação em tempo real e probabilidade de ganhar o jantar.",

    createTitle: "Criar liga",
    createSubtitle: "Define o nome, os jogadores e as rondas.",
    leagueNameLabel: "Nome da liga",
    leagueNamePlaceholder: "Liga dos Amigos",
    playersTitle: "Jogadores",
    playerPlaceholder: (i: number) => `Jogador ${i + 1}`,
    roundsTitle: "Rondas",
    roundPlaceholder: (i: number) => `Ronda ${i + 1}`,
    defaultRounds: [
      "Jornada 1",
      "Jornada 2",
      "Jornada 3",
      "Ronda de 32",
      "Oitavos",
      "Quartos",
      "Meias",
      "Final",
    ],
    createButton: "Criar liga",

    openTitle: "Abrir liga",
    openSubtitle: "Cola o link ou o código que recebeste.",
    openPlaceholder: "link ou código",
    openAria: "Abrir liga",

    recentTitle: "Ligas recentes",
    recentSubtitle: "Ligas que abriste neste dispositivo.",
    recentRemove: "Remover da lista",

    errNoName: "Dá um nome à liga.",
    errPlayers: "Adiciona pelo menos 2 jogadores.",
    errRounds: "Adiciona pelo menos 1 ronda.",
    errCreate: "Não foi possível criar a liga. Tenta novamente.",

    createdTitle: "Liga criada!",
    createdReady: "está pronta. Guarda a palavra-passe — é mostrada só desta vez.",
    shareLinkLabel: "Link para partilhar",
    passwordLabel: "Palavra-passe (para editar)",
    importantLabel: "Importante:",
    importantBody:
      "sem a palavra-passe não é possível recuperar o acesso de edição. Guarda-a num sítio seguro.",
    goToLeague: "Ir para a liga",
  },

  board: {
    leagueLabel: "Liga",
    notFoundTitle: "Liga não encontrada",
    notFoundCodePrefix: "O código",
    notFoundCodeSuffix: "não existe.",
    createOne: "Criar uma liga",

    addPlayer: "Adicionar jogador",
    editingActive: "Edição ativa",
    lockTitle: "Bloquear edição",
    editScores: "Editar pontos",
    unlockTitle: "Desbloquear edição",

    roundsPlayed: (played: number, total: number) => `${played}/${total} rondas jogadas`,
    heroTitleA: "Quem vai comer",
    heroTitleB: "o jantar à pala",
    heroSubtitle: (remaining: number) =>
      `Classificação em tempo real, probabilidade de ganhar o jantar com ${remaining} ${
        remaining === 1 ? "ronda" : "rondas"
      } por jogar.`,

    standings: "Classificação",
    standingsSummary: (players: number, rounds: number) =>
      `${players} ${players === 1 ? "jogador" : "jogadores"} · ${rounds} ${
        rounds === 1 ? "ronda" : "rondas"
      }`,
    roundButtonTitle: (played: boolean, name: string) =>
      `${played ? "Editar" : "Adicionar"} ${name}`,
    pointsButton: "Pontos",

    colPlayer: "Jogador",
    colDrinks: "Bebidas",
    colDinner: "Jantar pago",
    colTotal: "Total",

    winsBadgeTitle: (n: number) => `${n} ${n === 1 ? "ronda ganha" : "rondas ganhas"}`,
    winsBadgeText: (n: number) => `${n}× ${n === 1 ? "ronda" : "rondas"}`,
    removePlayer: "Remover jogador",
    changeDrink: "Mudar bebida",
    noPlayers: "Sem jogadores ainda.",
    footer:
      "Edição em tempo real · probabilidade de ganhar o jantar simulada com base nas rondas já jogadas",

    dinner1: "Jantar pago!",
    dinner2: "A cheirar o jantar",
    dinner3: "ACREDITA MALUCO!",
    dinner4: "A precisar de sorte",
    dinner5: "A pagar a conta",

    infoTitle: "Como é calculada a probabilidade",
    infoSubtitle: "Simulação de Monte Carlo · 4000 cenários",
    infoStep1a: "Para cada ronda que falta, cada jogador soma a sua",
    infoStep1bold: "média de pontos",
    infoStep1c: "com alguma variação aleatória.",
    infoStep2a: "Repetimos este cenário",
    infoStep2bold: "milhares de vezes",
    infoStep2c: ". Quem ficar com o total mais alto ganha o jantar nesse cenário.",
    infoStep3a: "A probabilidade é a",
    infoStep3bold: "fração de cenários",
    infoStep3c: "em que cada jogador vence.",
    infoFaq1bold: "Poucas rondas jogadas?",
    infoFaq1:
      "A média de cada um é puxada para a média da liga, por isso quem está atrás ainda tem hipótese enquanto houver rondas por jogar.",
    infoFaq2bold: "Sem rondas a jogar?",
    infoFaq2: "Ganha simplesmente quem tem mais pontos.",

    addPlayerPlaceholder: "Nome",
    passwordPrompt: "Introduz a palavra-passe da liga para editar os pontos.",
    passwordPlaceholder: "Palavra-passe",
    passwordWrong: "Palavra-passe incorreta.",
    unlock: "Desbloquear",

    roundLabel: "Ronda",
    points: "Pontos",
  },
};

export type Dict = typeof pt;
