export type Duration = 5 | 15 | 30;
export type PresentationMode = "expositivo" | "interativo";

export type PromptDefinition = {
  id: string;
  type: "choice" | "word";
  question: string;
  helper: string;
  options?: string[];
};

export type SlideDefinition = {
  id: string;
  numberLabel: string;
  kicker: string;
  title: string;
  body: string;
  variant:
    | "vision"
    | "pain"
    | "map"
    | "solution"
    | "modules"
    | "event"
    | "opportunity"
    | "journey"
    | "product"
    | "cadu"
    | "six-modules"
    | "governance"
    | "privacy"
    | "architecture"
    | "value"
    | "stakeholders"
    | "partnership"
    | "risk"
    | "pilot"
    | "metrics"
    | "scale"
    | "interaction"
    | "ask";
  durations: Duration[];
  modes?: PresentationMode[];
  points?: string[];
  prompt?: PromptDefinition;
  speakerNote: string;
};

export const allSlides: SlideDefinition[] = [
  {
    id: "vision",
    numberLabel: "VISÃO",
    kicker: "PITCH INSTITUCIONAL · UFG",
    title: "Toda a vida universitária, em um só lugar.",
    body: "Eventos e oportunidades que hoje se perdem entre sites, perfis e grupos — organizados, verificáveis e fáceis de encontrar.",
    variant: "vision",
    durations: [5, 15, 30],
    speakerNote: "Abra com a experiência cotidiana, não com tecnologia. A promessa é reduzir o esforço de descoberta sem competir com os canais oficiais.",
  },
  {
    id: "pain",
    numberLabel: "O PROBLEMA",
    kicker: "A INFORMAÇÃO EXISTE",
    title: "O acesso a ela é que falha.",
    body: "Uma oportunidade pode estar correta e publicada — e ainda assim não chegar a quem precisa, no momento em que precisa.",
    variant: "pain",
    durations: [5, 15, 30],
    points: ["Múltiplos sites e perfis", "Prazos curtos", "Busca sem contexto", "Dependência de grupos informais"],
    speakerNote: "Evite dizer que a UFG não comunica. O problema é fragmentação, alcance e custo de descoberta em um ecossistema amplo. Base de argumentação: diagnóstico e Cartões de Insight do TCC; Apêndices B–D.",
  },
  {
    id: "pulse",
    numberLabel: "ESCUTA",
    kicker: "INTERAÇÃO 01",
    title: "Por onde as oportunidades chegam até você hoje?",
    body: "Responda pelo celular. O resultado aparece aqui em tempo real.",
    variant: "interaction",
    durations: [5, 15, 30],
    modes: ["interativo"],
    prompt: {
      id: "source-pulse",
      type: "choice",
      question: "Por onde as oportunidades da UFG chegam até você hoje?",
      helper: "Escolha o canal que mais pesa na sua rotina.",
      options: ["WhatsApp", "Instagram", "Sites institucionais", "Colegas ou professores", "Muitas chegam tarde"],
    },
    speakerNote: "Use o resultado como ponte: nenhum canal é o vilão; o problema é depender de todos ao mesmo tempo para não perder nada.",
  },
  {
    id: "fragmentation",
    numberLabel: "ECOSSISTEMA",
    kicker: "O CUSTO INVISÍVEL",
    title: "Descobrir exige monitorar um labirinto.",
    body: "Portais, unidades acadêmicas, pró-reitorias, projetos, perfis sociais, editais e grupos cumprem papéis diferentes. A comunidade precisa costurar tudo manualmente.",
    variant: "map",
    durations: [15, 30],
    speakerNote: "A proposta não é centralizar a produção de conteúdo. É centralizar a descoberta e devolver o usuário à fonte responsável.",
  },
  {
    id: "solution",
    numberLabel: "A SOLUÇÃO",
    kicker: "UMA CAMADA DE DESCOBERTA",
    title: "O Kino Campus organiza. A fonte oficial continua soberana.",
    body: "A plataforma converte informações dispersas em publicações pesquisáveis, com prazo, contexto, categoria, local, contato e acesso ao documento original.",
    variant: "solution",
    durations: [5, 15, 30],
    points: ["Encontrar", "Entender", "Salvar", "Compartilhar", "Confirmar na fonte"],
    speakerNote: "Esta é a frase institucional-chave: camada de descoberta, não canal oficial substituto. Relacione com a Matriz Valor × Esforço e os requisitos priorizados do MVP no TCC.",
  },
  {
    id: "core-modules",
    numberLabel: "NÚCLEO",
    kicker: "MENOS ESFORÇO, MAIS ACESSO",
    title: "Dois módulos concentram o maior valor institucional imediato.",
    body: "Eventos e Oportunidades funcionam por convergência: a comunidade encontra, filtra e confirma conteúdos já existentes sem exigir uma nova rotina complexa das unidades.",
    variant: "modules",
    durations: [5],
    speakerNote: "No pitch curto, concentre-se nestes dois módulos. Os demais aparecem como potencial comunitário, não como distração.",
  },
  {
    id: "events",
    numberLabel: "EVENTOS",
    kicker: "DESCOBERTA COM CONTEXTO",
    title: "Data, local, público e inscrição no mesmo lugar.",
    body: "Palestras, congressos, oficinas, semanas acadêmicas, atividades culturais e encontros institucionais organizados por categoria e temporalidade.",
    variant: "event",
    durations: [15, 30],
    points: ["Calendário e filtros", "Link de inscrição", "Fonte responsável", "Eventos futuros e encerrados"],
    speakerNote: "Mostre que o módulo ajuda tanto a descobrir quanto a verificar alterações de sala, horário, modalidade e inscrição.",
  },
  {
    id: "opportunities",
    numberLabel: "OPORTUNIDADES",
    kicker: "PRAZOS NÃO ESPERAM",
    title: "Editais, bolsas e vagas com o que realmente decide uma candidatura.",
    body: "Prazo, público-alvo, requisito, modalidade, remuneração, documentos e fonte verificável aparecem antes do clique.",
    variant: "opportunity",
    durations: [15, 30],
    points: ["Bolsas e auxílios", "Estágios e empregos", "Pesquisa e monitoria", "Mobilidade e extensão"],
    speakerNote: "A utilidade está em transformar divulgação em decisão: vale para mim, ainda está aberto, onde confirmo e como me inscrevo?",
  },
  {
    id: "journey",
    numberLabel: "EXPERIÊNCIA",
    kicker: "ANTES E DEPOIS",
    title: "De procurar em muitos lugares a decidir em poucos passos.",
    body: "A experiência reduz troca de contexto, preserva o vínculo com a fonte e facilita compartilhar uma informação já organizada.",
    variant: "journey",
    durations: [15, 30],
    speakerNote: "Conte uma jornada concreta: estudante ou servidor vê o card, entende o essencial, salva e abre a fonte oficial para concluir a ação.",
  },
  {
    id: "product",
    numberLabel: "PRODUTO REAL",
    kicker: "PILOTO FUNCIONAL EM PRODUÇÃO",
    title: "Não é apenas uma ideia: já existe uma plataforma navegável.",
    body: "O Kino Campus está em produção com conteúdo real, filtros, busca, perfis, salvamentos, comentários, compartilhamento e páginas públicas indexáveis.",
    variant: "product",
    durations: [5, 15, 30],
    speakerNote: "Abra kinocampus.com.br se houver internet. O slide contém uma captura real como contingência. Para uma banca acadêmica, conecte as telas às Figuras 3–16 e ao roteiro de teste do Apêndice K.",
  },
  {
    id: "cadu",
    numberLabel: "CURADORIA",
    kicker: "CADU BOT",
    title: "Automação para ampliar cobertura — com barreiras de qualidade.",
    body: "O Cadu consulta fontes públicas ligadas à UFG, identifica conteúdo acionável, estrutura a publicação e direciona casos ambíguos para revisão.",
    variant: "cadu",
    durations: [5, 15, 30],
    points: ["Coleta", "Classificação", "Enriquecimento", "Validação", "Publicação ou revisão"],
    speakerNote: "Seja preciso: automação não elimina revisão. Prazo vencido, baixa confiança, conflito, link quebrado ou duplicidade podem bloquear a publicação.",
  },
  {
    id: "source-map",
    numberLabel: "COBERTURA",
    kicker: "MAPEAMENTO EM CONSTRUÇÃO",
    title: "Há potencial para organizar um ecossistema amplo de fontes.",
    body: "O registro candidato atual mapeia 166 entidades, 194 fontes web e 83 perfis de Instagram. Ele ainda está em validação e não representa cobertura ativa.",
    variant: "map",
    durations: [30],
    speakerNote: "Destaque a cautela: o registro candidato está desativado enquanto contratos, associações, riscos e critérios operacionais são validados.",
  },
  {
    id: "six-modules",
    numberLabel: "COMUNIDADE",
    kicker: "UMA PLATAFORMA, SEIS CONTEXTOS",
    title: "O valor institucional começa em dois módulos. A utilidade comunitária vai além.",
    body: "Eventos e Oportunidades formam o núcleo institucional; Moradia, Compra e Venda, Caronas e Achados/Perdidos conectam permanência, mobilidade, economia circular e pertencimento.",
    variant: "six-modules",
    durations: [15, 30],
    speakerNote: "Apresente Eventos e Oportunidades como núcleo da parceria; os demais módulos mostram permanência, vida comunitária e impacto socioambiental. Na versão longa, conecte com ODS 8, 11, 12 e 17.",
  },
  {
    id: "governance",
    numberLabel: "CONFIANÇA",
    kicker: "CURADORIA E MODERAÇÃO",
    title: "Utilidade sem abrir mão de responsabilidade.",
    body: "Política editorial, links originais, denúncias, revisão administrativa, encerramento de conteúdo e canais de correção formam uma trilha pública de confiança.",
    variant: "governance",
    durations: [15, 30],
    points: ["Fonte preservada", "Correção e remoção", "Anti-spam", "Transparência", "Responsabilidade definida"],
    speakerNote: "Não prometa veracidade total de fontes externas. O desenho correto é rastreabilidade, conferência e resposta a erro.",
  },
  {
    id: "privacy",
    numberLabel: "DIREITOS",
    kicker: "LGPD E ACESSIBILIDADE",
    title: "A parceria precisa nascer com limites claros.",
    body: "A plataforma separa áreas públicas e privadas, oferece preferências de consentimento, fluxos de suporte e exclusão, além de navegação responsiva e por teclado.",
    variant: "privacy",
    durations: [30],
    speakerNote: "Reforce que o piloto proposto não depende de acesso a bases privadas da UFG nem de dados acadêmicos sensíveis.",
  },
  {
    id: "architecture",
    numberLabel: "ROBUSTEZ",
    kicker: "BASE TÉCNICA AUDITÁVEL",
    title: "Código aberto, testes e infraestrutura já estruturada.",
    body: "Frontend web, Supabase, autenticação institucional, moderação, busca, automações e rotinas de qualidade formam uma base evolutiva — não um protótipo descartável.",
    variant: "architecture",
    durations: [30],
    points: ["Repositório público", "Suíte automatizada de testes", "Cenários E2E", "Busca textual e fuzzy", "Políticas de acesso"],
    speakerNote: "Use a base de testes como evidência de disciplina de engenharia, não como sinônimo automático de qualidade. Se pedirem números, confirme o relatório atualizado do repositório antes de citar uma contagem. O valor final precisa ser medido com usuários.",
  },
  {
    id: "value",
    numberLabel: "VALOR PARA A UFG",
    kicker: "COMUNICAÇÃO QUE CHEGA À AÇÃO",
    title: "Mais descoberta para a comunidade. Mais retorno para quem comunica.",
    body: "A parceria pode aumentar a vida útil e a encontrabilidade de conteúdos oficiais sem criar outro canal de publicação obrigatório para cada unidade.",
    variant: "value",
    durations: [5, 15, 30],
    points: ["Ampliar alcance útil", "Reduzir perda de prazo", "Fortalecer a comunidade", "Aprender com sinais agregados"],
    speakerNote: "Fale em hipótese de valor e piloto mensurável. Evite afirmar impacto antes da avaliação.",
  },
  {
    id: "stakeholders",
    numberLabel: "PARA QUEM",
    kicker: "VALOR DISTRIBUÍDO",
    title: "De grupos com mais de 3.600 pessoas a uma infraestrutura comum.",
    body: "A iniciativa nasceu em uma comunidade organizada no WhatsApp. O Kino Campus transforma uma demanda já existente em memória pesquisável: estudantes encontram; docentes e técnicos divulgam; unidades ampliam alcance.",
    variant: "stakeholders",
    durations: [15, 30],
    speakerNote: "Conte a origem: grupos comunitários iniciados em 21/01/2024 e mais de 3.600 participantes. Não venda um painel de vigilância; fale em sinais agregados de interesse, cobertura, busca, clique e encaminhamento para fontes.",
  },
  {
    id: "word-cloud",
    numberLabel: "ESCUTA",
    kicker: "INTERAÇÃO 02",
    title: "Em uma palavra: o que mais dificulta encontrar oportunidades?",
    body: "A nuvem se forma ao vivo e ajuda a nomear o problema com a linguagem do próprio público.",
    variant: "interaction",
    durations: [15, 30],
    modes: ["interativo"],
    prompt: {
      id: "barrier-cloud",
      type: "word",
      question: "Em uma palavra, o que mais dificulta encontrar oportunidades?",
      helper: "Use uma palavra ou expressão curta e respeitosa.",
    },
    speakerNote: "Leia os padrões, não cada palavra. Conecte o resultado a uma hipótese que o piloto poderá testar.",
  },
  {
    id: "partnership",
    numberLabel: "PARCERIA",
    kicker: "COMEÇAR PEQUENO, APRENDER RÁPIDO",
    title: "Uma parceria de baixo atrito e responsabilidade compartilhada.",
    body: "A proposta não exige integração sistêmica imediata. Começa com fontes públicas, unidades-piloto, critérios editoriais e um canal claro de correção.",
    variant: "partnership",
    durations: [5, 15, 30],
    speakerNote: "Apresente três níveis: apoio de divulgação, piloto com unidades e co-desenho de governança. A decisão de hoje é apenas o próximo passo.",
  },
  {
    id: "risk",
    numberLabel: "LIMITES",
    kicker: "RISCOS QUE PRECISAM SER GERIDOS",
    title: "Credibilidade depende do que o Kino Campus escolhe não fazer.",
    body: "Não falar em nome da UFG, não substituir editais, não coletar bases privadas no piloto, não automatizar sem revisão proporcional ao risco e não esconder erros.",
    variant: "risk",
    durations: [30],
    points: ["Independência explícita", "Fonte oficial prevalece", "Privacidade por desenho", "Correção rastreável"],
    speakerNote: "Este slide aumenta confiança porque delimita o produto e antecipa as objeções institucionais mais importantes.",
  },
  {
    id: "pilot",
    numberLabel: "PILOTO",
    kicker: "90 DIAS PARA GERAR EVIDÊNCIA",
    title: "Mapear, operar, medir e decidir.",
    body: "Um ciclo curto permite validar cobertura, qualidade, adoção e capacidade operacional antes de qualquer expansão institucional.",
    variant: "pilot",
    durations: [5, 15, 30],
    speakerNote: "Sugestão: 3 a 5 unidades ou pró-reitorias, uma pessoa de referência em cada, revisão quinzenal e relatório final com decisão de continuidade. Relacione a avaliação aos roteiros e instrumentos dos Apêndices H–K do TCC.",
  },
  {
    id: "metrics",
    numberLabel: "AVALIAÇÃO",
    kicker: "O QUE PRECISA SER MEDIDO",
    title: "Sucesso não é apenas publicar mais.",
    body: "O piloto deve observar cobertura de fontes, tempo de atualização, cliques para a fonte oficial, salvamentos, compartilhamentos, correções, duplicidades e percepção de utilidade.",
    variant: "metrics",
    durations: [15, 30],
    speakerNote: "Defina a linha de base antes do piloto. Métricas de atividade não substituem avaliação de qualidade e experiência.",
  },
  {
    id: "scale",
    numberLabel: "VISÃO DE FUTURO",
    kicker: "DA UFG PARA OUTRAS IES",
    title: "Primeiro provar na UFG. Depois tornar o modelo replicável.",
    body: "A expansão pode adaptar identidade, taxonomias, fontes e governança para instituições públicas e privadas sem perder a lógica comunitária da plataforma.",
    variant: "scale",
    durations: [30],
    speakerNote: "Trate expansão como direção estratégica, não como prioridade operacional imediata. A UFG é o ambiente para aprender e consolidar o modelo.",
  },
  {
    id: "priority",
    numberLabel: "DECISÃO",
    kicker: "INTERAÇÃO FINAL",
    title: "Onde uma parceria geraria mais valor primeiro?",
    body: "A votação ajuda a transformar a conversa em um próximo passo concreto.",
    variant: "interaction",
    durations: [15, 30],
    modes: ["interativo"],
    prompt: {
      id: "partnership-priority",
      type: "choice",
      question: "Onde uma parceria geraria mais valor primeiro?",
      helper: "Escolha uma prioridade para o piloto.",
      options: ["Curadoria de fontes oficiais", "Divulgação coordenada", "Piloto com unidades", "Indicadores agregados", "Formação de pontos focais"],
    },
    speakerNote: "Use a votação para perguntar quem pode apoiar o item mais votado e qual seria a primeira unidade interessada.",
  },
  {
    id: "ask",
    numberLabel: "PRÓXIMO PASSO",
    kicker: "UM CONVITE À CONSTRUÇÃO CONJUNTA",
    title: "Vamos testar uma forma melhor de fazer a informação chegar?",
    body: "O pedido de hoje: uma pessoa patrocinadora, unidades interessadas e uma reunião de desenho do piloto de 90 dias.",
    variant: "ask",
    durations: [5, 15, 30],
    speakerNote: "Feche com um pedido específico e pequeno. Evite pedir chancela ampla antes de construir evidência com o piloto.",
  },
];

export function buildDeck(duration: Duration, mode: PresentationMode) {
  return allSlides.filter(
    (slide) =>
      slide.durations.includes(duration) &&
      (!slide.modes || slide.modes.includes(mode)),
  );
}
