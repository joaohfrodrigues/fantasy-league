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
    metaTitle: "Fantasy League Tracker",
    metaDescription:
      "Acompanha as tuas ligas fantasy ronda a ronda — vencedores, prémios, probabilidades ao vivo e o histórico das tuas ligas.",
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
    metaTitle: "Fantasy League Tracker",
    metaDescription:
      "Acompanha as tuas ligas fantasy. Probabilidades ao vivo, prémios por ronda e o histórico das tuas ligas.",
    brandSubtitle: "Acompanha as tuas ligas fantasy · Partilha o link · Vê quem janta à pala",
    heroEyebrow: "Tracker de ligas fantasy",
    heroTitleA: "Cria o teu tracker",
    heroTitleB: "e vê quem janta à pala",
    heroSubtitle:
      "Acompanha a tua liga fantasy ronda a ronda. Recebes um link para partilhar e uma palavra-passe para editar os pontos — com classificação ao vivo e a probabilidade de cada um ganhar o jantar.",
    heroCta: "Cria o teu tracker",

    features: {
      title: "Porquê usar o tracker",
      simulateTitle: "Final simulado",
      simulateDesc:
        "Projetamos todas as rondas que faltam para mostrar a probabilidade de cada jogador ganhar.",
      prizesTitle: "Vencedores e prémios",
      prizesDesc: "Cada vencedor de ronda e respetivo prémio fica registado, ronda a ronda.",
      historyTitle: "Histórico de ligas",
      historyDesc: "Guarda a memória das tuas ligas anteriores.",
    },

    example: {
      badge: "Exemplo",
      title: "Mundial 2026",
      subtitle: "4 jogadores · 3 rondas",
      caption: "Uma liga de exemplo — é assim que a tua vai ficar.",
      cta: "Cria o teu tracker",
    },

    createTitle: "Criar tracker",
    createSubtitle: "Dá-lhe o nome da tua competição, adiciona os jogadores e as rondas.",
    setupEyebrow: "Começar",
    setupTitle: "Cria a tua liga",
    setupSubtitle: "Monta o teu tracker em segundos ou abre uma liga que já exista.",
    leagueNameLabel: "Nome da liga",
    leagueNamePlaceholder: "Mundial 2026",
    createPasswordLabel: "Palavra-passe",
    createPasswordPlaceholder: "Deixa vazio para gerar automaticamente",
    createPasswordHelp: "Opcional. Usa entre 4 e 8 caracteres.",
    playersTitle: "Jogadores",
    playerPlaceholder: (i: number) => `Jogador ${i + 1}`,
    templates: {
      title: "Formato",
      subtitle: "Escolhe a estrutura da liga.",
      worldCup: { label: "Mundial", desc: "3 jornadas de grupos + mata-mata" },
      championsLeague: { label: "Liga dos Campeões", desc: "8 jornadas de liga + mata-mata" },
      league: { label: "Liga", desc: "Pontos corridos" },
      knockout: { label: "Mata-mata", desc: "Eliminação direta" },
      leagueRoundsLabel: "Número de jornadas",
      knockoutDepthLabel: "Número de rondas",
      previewLabel: "Rondas",
      matchday: (n: number) => `Jornada ${n}`,
      leagueRound: (n: number) => `Jornada ${n}`,
      knockoutNames: {
        r64: "Ronda de 64",
        r32: "Ronda de 32",
        r16: "Oitavos",
        qf: "Quartos",
        sf: "Meias",
        final: "Final",
      },
    },
    createButton: "Criar tracker",

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
    errPasswordLength: "A palavra-passe deve ter entre 4 e 8 caracteres.",
    errCreate: "Não foi possível criar a liga. Tenta novamente.",

    createdTitle: "Liga criada!",
    createdReadyGenerated: "está pronta. Guarda a palavra-passe — é mostrada só desta vez.",
    createdReadyChosen: "está pronta. A palavra-passe que escolheste já está ativa para edição.",
    shareLinkLabel: "Link para partilhar",
    passwordLabel: "Palavra-passe (para editar)",
    importantLabel: "Importante:",
    importantBody:
      "sem a palavra-passe não é possível recuperar o acesso de edição. Guarda-a num sítio seguro.",
    passwordChosenLabel: "Palavra-passe definida:",
    passwordChosenBody: "a palavra-passe que introduziste ficou ativa para editar esta liga.",
    goToLeague: "Ir para a liga",
  },

  board: {
    leagueLabel: "Liga",
    notFoundTitle: "Liga não encontrada",
    notFoundCodePrefix: "O código",
    notFoundCodeSuffix: "não existe.",
    createOne: "Criar uma liga",

    addPlayer: "Adicionar jogador",
    addRound: "Adicionar ronda",
    deleteRound: "Remover ronda",
    deleteRoundConfirm: (name: string) => `Remover ${name}? Os pontos desta ronda serão apagados.`,
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
    colRoundPrizes: "Premios por ronda",
    colDinner: "Jantar pago",
    colTotal: "Total",

    winsBadgeTitle: (n: number) => `${n} ${n === 1 ? "ronda ganha" : "rondas ganhas"}`,
    winsBadgeText: (n: number) => `${n}× ${n === 1 ? "ronda" : "rondas"}`,
    removePlayer: "Remover jogador",
    changeRoundPrizeEmoji: "Mudar emoji do premio da ronda",
    noPlayers: "Sem jogadores ainda.",
    footer:
      "Edição em tempo real · Probabilidade de ganhar o jantar simulada com base nas rondas já jogadas",

    sortBy: (col: string) => `Ordenar por ${col}`,
    statsTitle: "Estatísticas",
    statsHighest: "Melhor pontuação",
    statsLowest: "Pior pontuação",
    statsAverage: "Pontuação média",
    statsRoundMargin: "Maior margem",
    statsLead: "Vantagem atual",
    statsAcross: (n: number) => `em ${n} ${n === 1 ? "pontuação" : "pontuações"}`,
    statsLeadBy: (name: string) => `${name} à frente`,
    statsTied: "Empate na liderança",

    dinner1: "Jantar pago!",
    dinner2: "Quase lá!",
    dinner3: "ACREDITA!",
    dinner4: "A precisar de sorte",
    dinner5: "A pagar a conta",

    infoTitle: "Como é calculada a probabilidade",
    infoSubtitle: "Simulação de Monte Carlo · 6000 cenários",
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
    passwordCheckFailed:
      "Não foi possível validar a palavra-passe agora. Tenta de novo daqui a pouco.",
    unlock: "Desbloquear",

    roundLabel: "Ronda",
    points: "Pontos",
    clearScore: "Limpar pontos",
  },
};

export type Dict = typeof pt;
