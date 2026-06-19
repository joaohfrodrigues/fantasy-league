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
    clear: "Limpar tudo",
  },

  root: {
    metaTitle: "Fantasy Tracker",
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
    metaTitle: "Fantasy Tracker",
    metaDescription:
      "Acompanha as tuas ligas fantasy. Probabilidades ao vivo, prémios por ronda e o histórico das tuas ligas.",
    brandSubtitle: "Acompanha as tuas ligas fantasy · Partilha o link · Vê quem ganha o prémio",
    heroEyebrow: "Tracker de ligas fantasy",
    heroTitleA: "Cria o teu tracker",
    heroTitleB: "e vê quem janta à pala",
    heroSubtitle:
      "Acompanha a tua liga fantasy ronda a ronda. Recebes um link para partilhar e uma palavra-passe para editar os pontos — com classificação ao vivo e a probabilidade de cada um ganhar o prémio.",
    heroCta: "Cria o teu tracker",
    heroFootnote: "* Jantar é só um exemplo — a tua liga pode jogar por qualquer prémio.",

    features: {
      title: "Porquê usar o tracker",
      simulateTitle: "Simulações para resultados e cenários futuros",
      simulateDesc:
        "Projetamos todas as rondas que faltam para mostrar a probabilidade de cada jogador ganhar — e podes simular cenários hipotéticos para ver como os resultados futuros a alterariam.",
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
    createPasswordHelp: "Opcional. Usa entre 8 e 64 caracteres.",
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

    importTitle: "Importar de ficheiro",
    importSubtitle: "Cria uma nova liga a partir de uma cópia JSON.",
    importButton: "Escolher ficheiro",
    importErrParse: "Esse ficheiro não é JSON válido.",
    importErrTooLarge: "Esse ficheiro é demasiado grande para ser uma cópia de liga.",
    importErrVersion: "Esta cópia foi feita com uma versão não suportada.",
    importErrInvalid: "Não foi possível importar esta cópia.",

    recentTitle: "Ligas recentes",
    recentSubtitle: "Ligas que abriste neste dispositivo.",
    recentRemove: "Remover da lista",

    errNoName: "Dá um nome à liga.",
    errPlayers: "Adiciona pelo menos 2 jogadores.",
    errRounds: "Adiciona pelo menos 1 ronda.",
    errPasswordLength:
      "A palavra-passe deve ter entre 8 e 64 caracteres e não ser demasiado simples.",
    errRateLimited: "Tentativas a mais neste momento. Aguarda um pouco e tenta novamente.",
    errLeagueCapacity:
      "A criação de novas ligas está temporariamente indisponível. Tenta novamente mais tarde.",
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
    editLeagueName: "Renomear liga",
    leagueNameLabel: "Nome da liga",
    leagueNamePlaceholder: "Nome da liga",
    removePlayerTitle: "Remover jogador",
    removePlayerConfirm: (name: string) =>
      `Remover ${name} desta liga? As pontuações dele também serão apagadas.`,
    addRound: "Adicionar ronda",
    createRoundTitle: "Criar ronda",
    editRoundDetails: "Editar detalhes da ronda",
    roundNameLabel: "Nome da ronda",
    roundNamePlaceholder: "Nome da ronda",
    roundShortLabel: "Nome curto",
    roundShortPlaceholder: "Etiqueta curta",
    deleteRound: "Remover ronda",
    deleteRoundConfirm: (name: string) => `Remover ${name}? Os pontos desta ronda serão apagados.`,
    lockRound: "Bloquear ronda",
    unlockRound: "Desbloquear ronda",
    lockRoundConfirm: (name: string) =>
      `Bloquear ${name}? Confirma que a ronda terminou — os pontos não poderão ser editados até desbloquear.`,
    roundLocked: "Bloqueada",
    roundLockedNote: "Esta ronda está bloqueada. Desbloqueie para editar os pontos.",
    editingActive: "Edição ativa",
    lockTitle: "Bloquear edição",
    editScores: "Editar pontos",
    unlockTitle: "Desbloquear edição",

    exportData: "Exportar",
    exportTitle: "Descarregar uma cópia JSON desta liga",
    moreActions: "Mais ações",
    moreActionsLocked: "Desbloqueie para aceder a mais ações.",

    whatIf: "E se",
    whatIfTitle: "Explorar resultados hipotéticos sem guardar",
    whatIfActive: "Modo e se",
    whatIfBanner:
      "Modo hipotético — estas pontuações nunca são guardadas. A classificação e as probabilidades abaixo são simuladas a partir delas.",
    whatIfExit: "Sair",
    whatIfClearAll: "Limpar tudo",
    whatIfClearRound: "Limpar ronda",
    whatIfPickRound: "Ronda",
    whatIfNoRounds:
      "Ainda não há rondas para explorar. O modo e se aplica-se a rondas que ainda não foram jogadas e não estão bloqueadas.",
    whatIfRoundLabel: (name: string) => `Pontuações hipotéticas · ${name}`,

    tiebreak: "Desempate",
    tiebreakTitle: "Como são ordenados os jogadores com os mesmos pontos",
    tiebreakTotal: "Apenas pontos totais",
    tiebreakWins: "Mais rondas ganhas",
    tiebreakLatest: "Melhor última ronda",
    tiebreakInfoTitle: "Como funciona o desempate",
    tiebreakInfoSubtitle: "Usado quando os jogadores têm os mesmos pontos totais.",
    tiebreakInfoTotal:
      "mantém os jogadores empatados a menos que outro sinal de ranking desfaça o empate.",
    tiebreakInfoWins: "coloca à frente quem ganhou mais rondas.",
    tiebreakInfoLatest: "coloca à frente quem teve a melhor ronda mais recente.",

    history: "Histórico",
    historyTitle: "Histórico de edições",
    historySubtitle: "Alterações recentes nesta liga.",
    historyEmpty: "Ainda não há alterações registadas.",
    historyError: "Não foi possível carregar o histórico.",
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
          return `${e.player} marcou ${e.to} em ${e.round}`;
        case "score:UPDATE":
          return `${e.player} em ${e.round}: ${e.from} → ${e.to}`;
        case "score:DELETE":
          return `Pontos de ${e.player} removidos em ${e.round}`;
        case "round:INSERT":
          return `Ronda adicionada: ${e.round}`;
        case "round:DELETE":
          return `Ronda removida: ${e.round}`;
        case "round:LOCK":
          return `Ronda bloqueada: ${e.round}`;
        case "round:UNLOCK":
          return `Ronda desbloqueada: ${e.round}`;
        case "round:UPDATE":
          return `Ronda atualizada: ${e.round}`;
        case "player:INSERT":
          return `Jogador adicionado: ${e.player}`;
        case "player:DELETE":
          return `Jogador removido: ${e.player}`;
        case "drink:UPDATE":
          return `Prémio de ${e.player}: ${e.from ?? "—"} → ${e.to ?? "—"}`;
        case "league:UPDATE":
          return `Liga renomeada: ${e.from ?? "—"} → ${e.to ?? "—"}`;
        case "league:TIEBREAK":
          return `Regra de desempate: ${e.from ?? "—"} → ${e.to ?? "—"}`;
        default:
          return `${e.entityType} ${e.action.toLowerCase()}`;
      }
    },

    roundsPlayed: (played: number, total: number) => `${played}/${total} rondas jogadas`,
    heroTitleA: "Quem vai",
    heroTitleB: "jantar à pala",
    heroSubtitle: (remaining: number) =>
      `Classificação em tempo real, probabilidade de ganhar o prémio com ${remaining} ${
        remaining === 1 ? "ronda" : "rondas"
      } por jogar.`,
    heroFootnote: "* Jantar é só um exemplo — a tua liga pode jogar por qualquer prémio.",

    standings: "Classificação",
    standingsSummary: (players: number, rounds: number) =>
      `${players} ${players === 1 ? "jogador" : "jogadores"} · ${rounds} ${
        rounds === 1 ? "ronda" : "rondas"
      }`,
    roundButtonTitle: (played: boolean, name: string) =>
      `${played ? "Editar" : "Adicionar"} ${name}`,
    pointsButton: "Pontos",

    colPlayer: "Jogador",
    colRoundPrizes: "Rondas ganhas",
    colDinner: "Quem leva a taça?",
    colTotal: "Total",

    winsBadgeTitle: (n: number) => `${n} ${n === 1 ? "ronda ganha" : "rondas ganhas"}`,
    winsBadgeText: (n: number) => `${n}× ${n === 1 ? "ronda" : "rondas"}`,
    removePlayer: "Remover jogador",
    changeRoundPrizeEmoji: "Mudar emoji do premio da ronda",
    noPlayers: "Sem jogadores ainda.",
    footer:
      "Edição em tempo real · Probabilidade de ganhar o prémio simulada com base nas rondas já jogadas",

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

    dinner1: "Prémio ganho!",
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
    infoStep2c: ". Quem ficar com o total mais alto ganha o prémio nesse cenário.",
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
    passwordRateLimited: "Tentativas a mais. Aguarda um pouco antes de tentar novamente.",
    passwordCheckFailed:
      "Não foi possível validar a palavra-passe agora. Tenta de novo daqui a pouco.",
    unlock: "Desbloquear",

    roundLabel: "Ronda",
    points: "Pontos",
    clearScore: "Limpar pontos",
  },
};

export type Dict = typeof pt;
