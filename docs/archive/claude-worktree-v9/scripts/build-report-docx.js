const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageBreak, PageNumber, LevelFormat, ExternalHyperlink,
} = require("docx");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const accentColor = "FF6B00";

function txt(text, opts = {}) { return new TextRun({ text, font: "Arial", size: 22, ...opts }); }
function bold(text, opts = {}) { return txt(text, { bold: true, ...opts }); }
function heading(text, level) {
  return new Paragraph({ heading: level, spacing: { before: 200, after: 100 }, children: [new TextRun({ text, font: "Arial", bold: true })] });
}
function para(runs, opts = {}) {
  const children = typeof runs === "string" ? [txt(runs)] : runs;
  return new Paragraph({ spacing: { after: 100 }, ...opts, children });
}
function emptyLine() { return new Paragraph({ spacing: { after: 60 }, children: [] }); }

function makeCell(text, opts = {}) {
  const runs = typeof text === "string" ? [txt(text, opts.runOpts || {})] : text;
  return new TableCell({
    borders,
    margins: cellMargins,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: runs })],
  });
}
function makeHeaderCell(text, w) {
  return makeCell(text, { width: w, shading: "2B2B3D", runOpts: { bold: true, color: "FFFFFF" } });
}

function makeTable(headers, rows, widths) {
  const totalW = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ children: headers.map((h, i) => makeHeaderCell(h, widths[i])) }),
      ...rows.map(r => new TableRow({
        children: r.map((c, i) => makeCell(c, { width: widths[i] })),
      })),
    ],
  });
}

// ---------- BUILD DOCUMENT ----------
const children = [];

// Cover
children.push(emptyLine(), emptyLine(), emptyLine());
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
  new TextRun({ text: "RELATORIO TECNICO", font: "Arial", size: 44, bold: true, color: accentColor }),
] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
  new TextRun({ text: "KINOCAMPUS v9.0", font: "Arial", size: 36, bold: true }),
] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [
  txt("Plataforma de Comunidade Universitaria da UFG", { size: 26, color: "666666" }),
] }));
children.push(emptyLine());
children.push(para([bold("Data: "), txt("02 de abril de 2026")]));
children.push(para([bold("Versao: "), txt("9.0.0 (Fundacoes)")]));
children.push(para([bold("Autor tecnico: "), txt("Claude Code (Anthropic) sob direcao de Yan Diamantino")]));
children.push(para([bold("Plataforma: "), txt("https://www.kinocampus.com.br")]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// PARTE 1
children.push(heading("PARTE 1 - DIAGNOSTICO E ESTADO ATUAL", HeadingLevel.HEADING_1));

children.push(heading("1.1. Sobre a Plataforma", HeadingLevel.HEADING_2));
children.push(para("O KinoCampus e uma plataforma digital de comunidade universitaria exclusiva para a Universidade Federal de Goias (UFG). Conecta alunos, professores e egressos em 6 modulos tematicos:"));
children.push(makeTable(
  ["Modulo", "Proposito", "Exemplo de uso"],
  [
    ["Compra e Venda", "Marketplace de produtos", "Vender livros usados, eletronicos"],
    ["Caronas", "Ofertas e pedidos de carona", "Carona para o campus"],
    ["Moradia", "Anuncios de moradia", "Quartos perto da UFG, republicas"],
    ["Eventos", "Agenda de eventos", "Workshops, festas, palestras"],
    ["Oportunidades", "Vagas e oportunidades", "Estagios, monitorias, voluntariado"],
    ["Achados e Perdidos", "Itens perdidos/encontrados", "Documentos, eletronicos perdidos no campus"],
  ],
  [2500, 3200, 3660]
));
children.push(emptyLine());
children.push(para([bold("Restricao de acesso: "), txt("Apenas e-mails institucionais (@ufg.br, @discente.ufg.br, @egresso.ufg.br).")]));

children.push(heading("1.2. Stack Tecnologica", HeadingLevel.HEADING_2));
children.push(makeTable(
  ["Camada", "Tecnologia"],
  [
    ["Frontend", "HTML5 + CSS3 + Vanilla JS (55+ modulos IIFE, sem framework/bundler)"],
    ["Backend", "Supabase (PostgreSQL 17 + Auth + Storage + Edge Functions + Realtime)"],
    ["Hosting", "Vercel (static site + serverless OG images)"],
    ["Dominio", "kinocampus.com.br (Hostinger, DNS para Vercel)"],
    ["Build", "node scripts/inject-env.js (substitui placeholders)"],
    ["Testes", "Jest: 7 arquivos, 31 testes, <5% cobertura"],
    ["CSS", "5 arquivos (~12.500 linhas), dark mode com custom properties"],
    ["Icones", "Font Awesome 6 (CDN)"],
  ],
  [2500, 6860]
));

children.push(heading("1.3. Arquitetura JS", HeadingLevel.HEADING_2));
children.push(para("O frontend usa o padrao IIFE + window.*: cada modulo e uma funcao auto-executavel que expoe metodos publicos globalmente."));
children.push(makeTable(
  ["Categoria", "Arquivos", "Tamanho aprox."],
  [
    ["Core/Utils", "kc-utils.js, kc-core.js, kc-constants.js, kc-api.client.js", "~221 KB"],
    ["Auth/Profile", "kc-auth.ui.js, kc-supabase.client.js, account-profile.shared.js", "~114 KB"],
    ["Features", "kc-create-post.js, kc-comments.js, kc-search.js, kc-ranking.js, kc-banners.js", "~196 KB"],
    ["Controllers", "22 arquivos (product 114KB, admin-dashboard 85KB, etc.)", "~772 KB"],
    ["Adapters", "supabase.adapter.js, local.adapter.js", "~100 KB"],
    ["TOTAL", "39 arquivos principais", "~1.4 MB"],
  ],
  [2200, 5000, 2160]
));

children.push(heading("1.4. Banco de Dados (16 tabelas)", HeadingLevel.HEADING_2));
children.push(makeTable(
  ["Tabela", "Proposito"],
  [
    ["profiles", "Perfis de usuario (nome, avatar, bio, social links, verificacao)"],
    ["posts", "Publicacoes (titulo, descricao, preco, modulo, categoria, metadata, status)"],
    ["post_media", "Imagens dos posts (URL, capa, ordem)"],
    ["comments", "Comentarios com suporte a markdown inline"],
    ["comment_likes", "Curtidas em comentarios (1 por usuario)"],
    ["post_votes", "Votos up/down (1 por usuario por post)"],
    ["saved_posts", "Posts salvos (favorito, lembrar, destaque)"],
    ["reports", "Denuncias com status (open, closed, archived)"],
    ["hero_banners", "Banners do carousel da homepage"],
    ["post_limits", "Limites de posts por modulo por usuario"],
    ["search_queries", "Analytics de busca"],
    ["audit_log", "Log de auditoria de acoes de admin"],
    ["help_requests", "Tickets de suporte"],
  ],
  [3000, 6360]
));

children.push(emptyLine());
children.push(para([bold("Seguranca: "), txt("RLS em todas as tabelas (53+ politicas), HMAC-SHA256 em Edge Function, search_path=public em todas SECURITY DEFINER functions, rate limiting, audit log.")]));
children.push(para([bold("RPCs: "), txt("65+ funcoes (kc_bump_post, kc_renew_post, kc_expire_old_posts, kc_get_top_contributors, kc_check_post_limit, etc.).")]));
children.push(para([bold("pg_cron: "), txt("Job diario as 03:00 para expirar posts automaticamente.")]));

children.push(heading("1.5. Ranking (Gamificacao)", HeadingLevel.HEADING_2));
children.push(makeTable(
  ["Acao", "Pontos"],
  [
    ["Criar post", "+15"],
    ["Receber voto positivo", "+10"],
    ["Escrever comentario", "+5"],
    ["Post acessado (CTA clicado)", "+4"],
    ["Post compartilhado", "+3"],
    ["Denuncia confirmada (penalidade)", "-50"],
  ],
  [6000, 3360]
));
children.push(para([bold("Anti-spam: "), txt("Cada acao contabilizada uma unica vez por publicacao.")]));

children.push(heading("1.6. Gaps Identificados (Pre-v9)", HeadingLevel.HEADING_2));
children.push(makeTable(
  ["Prioridade", "Gap", "Impacto"],
  [
    ["Critica", "Cobertura de testes <5%", "Regressoes nao detectadas"],
    ["Critica", "Sem notificacoes in-app", "Usuarios sem feedback de interacoes"],
    ["Alta", "Sem threading em comentarios", "Conversas confusas"],
    ["Alta", "Paginacao indefinida", "Performance com 1000+ posts"],
    ["Media", "Sem filtros avancados", "Dificil encontrar posts especificos"],
    ["Media", "Sem avaliacoes de usuarios", "Falta sinal de confianca"],
    ["Baixa", "Cashback in-development", "Teaser sem backend"],
  ],
  [2000, 3800, 3560]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// PARTE 2
children.push(heading("PARTE 2 - O QUE FOI IMPLEMENTADO (v9.0)", HeadingLevel.HEADING_1));

children.push(heading("2.1. PR #194 - Fundacoes v9.0", HeadingLevel.HEADING_2));
children.push(para([bold("Branch: "), txt("feat/v9-0-foundations (baseada em kinocampus-V8.2-SANEAMENTO-QA)")]));
children.push(para([bold("Status: "), txt("Criado em 02/04/2026, pronto para merge")]));
children.push(para([bold("Arquivos alterados: "), txt("10 (2 modificados + 8 novos)")]));

children.push(heading("2.1.1. Documentacao Tecnica (v9.0.1) - CONCLUIDO", HeadingLevel.HEADING_3));
children.push(makeTable(
  ["Arquivo", "Conteudo"],
  [
    ["docs/architecture.md", "Mapa de dependencias JS, fluxos de dados, paginas HTML"],
    ["docs/api-contract.md", "Contrato de 18+ metodos KCAPI com params e retornos"],
    ["docs/db-schema.md", "Schema de 16 tabelas, RLS, indexes, Storage, pg_cron"],
    ["docs/rpc-catalog.md", "Catalogo de RPCs e triggers com assinaturas"],
    ["docs/module-schemas.md", "KC_CREATE_SCHEMA dos 6 modulos"],
    ["docs/env-vars.md", "Variaveis de ambiente Vercel + Supabase + KC_ENV"],
    ["docs/design-system.md", "CSS custom properties, componentes, breakpoints"],
    ["docs/index.md", "Indice da documentacao com quick reference"],
  ],
  [3500, 5860]
));
children.push(para([bold("Total: ~1.500 linhas de documentacao tecnica")]));

children.push(heading("2.1.2. Correcoes de Seguranca (v9.0.3) - CONCLUIDO", HeadingLevel.HEADING_3));
children.push(para([bold("1. Bloqueio de SVG em Uploads: "), txt("SVGs podem conter JavaScript malicioso. Removido image/svg+xml dos tipos permitidos. Tipos aceitos: JPEG, PNG, WebP, GIF.")]));
children.push(para([bold("2. Validacao de Magic Bytes: "), txt("Nova funcao checkImageMagicBytes(blob) valida os primeiros 12 bytes do arquivo. Previne ataques com arquivos maliciosos renomeados como imagens.")]));
children.push(para([bold("3. Invalidacao de Cache: "), txt("SESSION_STORE_VERSION atualizado de 8.3.4.5 para 9.0.0. Forca revalidacao de sessoes em upgrade major.")]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// PARTE 3
children.push(heading("PARTE 3 - ROTEIRO COMPLETO v9", HeadingLevel.HEADING_1));

children.push(heading("3.1. Principios", HeadingLevel.HEADING_2));
const principles = [
  "Evolutivo, nao reescrita - cada feature branch e pequena, testavel, revertivel",
  "Test-first nas novas features - cobertura nova vai junto com o codigo",
  "Documentar ao construir - nao existe 'vou documentar depois'",
  "Mobile-first em tudo - 60%+ dos usuarios sao mobile",
  "Seguranca nao negocia - qualquer mudanca em RLS passa por review manual",
  "Performance como feature - bundles grandes prejudicam conexoes lentas",
  "Preservar padroes existentes - IIFE + window.* ate migracao ESM",
];
principles.forEach((p, i) => children.push(para([bold(`${i + 1}. `), txt(p)])));

children.push(heading("3.2. Fases", HeadingLevel.HEADING_2));

// Phase table
children.push(makeTable(
  ["Fase", "Descricao", "Status"],
  [
    ["v9.0.1", "Documentacao de arquitetura (8 arquivos em docs/)", "CONCLUIDO"],
    ["v9.0.2", "Cobertura de testes (meta: 40%)", "PENDENTE"],
    ["v9.0.3", "Consolidacao de seguranca (SVG block, magic bytes, session)", "CONCLUIDO"],
    ["v9.0.4", "Divida tecnica DB (retencao analytics, legacy_id)", "PENDENTE"],
    ["v9.1.0", "Notificacoes in-app (PRIORIDADE MAXIMA)", "PENDENTE"],
    ["v9.1.1", "Comment threading (1 nivel, estilo Instagram)", "PENDENTE"],
    ["v9.1.2", "Avaliacoes de usuarios (1-5 estrelas)", "PENDENTE"],
    ["v9.2.0", "Busca server-side (PostgreSQL Full-Text Search)", "PENDENTE"],
    ["v9.2.1", "Filtros avancados nos feeds (preco, data, tipo)", "PENDENTE"],
    ["v9.2.2", "Paginacao cursor-based", "PENDENTE"],
    ["v9.3.0", "Cashback (requer definicao de negocio)", "BLOQUEADO"],
    ["v9.3.1", "Analytics de post para autores", "PENDENTE"],
    ["v9.3.2", "Moderacao automatica anti-spam", "PENDENTE"],
    ["v9.4.0", "Lazy loading de modulos grandes", "PENDENTE"],
    ["v9.4.1", "Otimizacao de imagens (Supabase Transform)", "PENDENTE"],
    ["v9.4.2", "Acessibilidade (A11y)", "PENDENTE"],
  ],
  [1500, 5860, 2000]
));

children.push(heading("3.3. Detalhes das Proximas Fases", HeadingLevel.HEADING_2));

children.push(heading("v9.1.0 - Notificacoes In-App", HeadingLevel.HEADING_3));
children.push(para([bold("Backend: "), txt("Nova tabela notifications com RLS. Triggers para comentarios, votos positivos e expiracao de posts.")]));
children.push(para([bold("Frontend: "), txt("Novo modulo kc-notifications.js. Icone de sino no header com badge. Dropdown com avatar + texto + timestamp. Supabase Realtime. Deep links.")]));

children.push(heading("v9.1.1 - Comment Threading", HeadingLevel.HEADING_3));
children.push(para("Coluna parent_id na tabela comments. Limite de 1 nivel de profundidade. Renderizacao indentada com borda lateral."));

children.push(heading("v9.1.2 - Avaliacoes", HeadingLevel.HEADING_3));
children.push(para("Nova tabela user_ratings (1-5 estrelas + texto curto). Rating medio no perfil e seller card. Apenas quem interagiu pode avaliar."));

children.push(heading("v9.2.0 - Busca Server-Side", HeadingLevel.HEADING_3));
children.push(para("Indice GIN para full-text em portugues. RPC kc_search_posts com ts_rank. Sinonimos expandidos client-side antes de enviar ao RPC."));

children.push(heading("v9.2.1 - Filtros Avancados", HeadingLevel.HEADING_3));
children.push(para("Por modulo: range de preco, data, tipo, regiao. Persistencia em URL params. Accordion desktop, drawer mobile."));

children.push(heading("v9.2.2 - Paginacao Cursor-Based", HeadingLevel.HEADING_3));
children.push(para("Melhor que offset para feeds com insercoes frequentes. Botao 'Carregar mais' (nao infinite scroll)."));

children.push(heading("v9.3.1 - Analytics de Post", HeadingLevel.HEADING_3));
children.push(para("view_count em posts + tabela post_view_events. Anti-spam: 1 view/usuario/hora. Mini-analytics em Meus Posts."));

children.push(heading("v9.3.2 - Moderacao Automatica", HeadingLevel.HEADING_3));
children.push(para("Flood control (max 3 posts/hora), link spam (>3 URLs = pending), score de confianca para usuarios novos."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// PARTE 4
children.push(heading("PARTE 4 - PADROES DE CODIGO E PROCESSOS", HeadingLevel.HEADING_1));

children.push(heading("4.1. Padrao IIFE", HeadingLevel.HEADING_2));
children.push(para("Todos os novos modulos JS devem usar IIFE: funcao auto-executavel com 'use strict', funcoes privadas internas, interface publica em window.*, inicializacao no DOMContentLoaded."));

children.push(heading("4.2. Padrao Driver", HeadingLevel.HEADING_2));
children.push(para("KC_ENV.driver seleciona entre SupabaseAdapter (producao) e LocalAdapter (desenvolvimento). KCAPI e a facade."));

children.push(heading("4.3. Padrao Popover", HeadingLevel.HEADING_2));
children.push(para("Trio openXPopover/closeXPopover/wireXPopover. CSS reutiliza classes .kc-save-popover. Desktop: dropdown ancorado. Mobile: bottom sheet. Exclusao mutua entre popovers."));

children.push(heading("4.4. Sanitizacao", HeadingLevel.HEADING_2));
children.push(para([bold("OBRIGATORIO: "), txt("Sempre usar window.KCUtils.escapeHtml() antes de inserir dados de usuario em innerHTML. Nunca inserir conteudo cru (risco XSS).")]));

children.push(heading("4.5. Processo de Feature Branch", HeadingLevel.HEADING_2));
children.push(para("1. git checkout kinocampus-V8.2-SANEAMENTO-QA && git pull"));
children.push(para("2. git checkout -b feat/nome-da-feature"));
children.push(para("3. Implementar + testes + docs"));
children.push(para("4. npm test (todos os testes passam)"));
children.push(para("5. node scripts/hygiene-check.js"));
children.push(para("6. gh pr create --base kinocampus-V8.2-SANEAMENTO-QA"));
children.push(para("7. Apos merge: excluir feature branch local e remota"));

children.push(heading("4.6. Checklist por PR", HeadingLevel.HEADING_2));
children.push(makeTable(
  ["Categoria", "Itens"],
  [
    ["Funcionalidade", "npm test passa, testes novos, testado mobile 375px + desktop 1440px, dark mode, estados (vazio/loading/erro)"],
    ["Seguranca", "Mutations requerem auth, MIME type validado em uploads, RLS em novas tabelas, search_path=public"],
    ["Banco", "Migration testada em staging, rollback documentado, indices para queries frequentes"],
  ],
  [2500, 6860]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// PARTE 5
children.push(heading("PARTE 5 - DESIGN SYSTEM", HeadingLevel.HEADING_1));

children.push(heading("5.1. Cores", HeadingLevel.HEADING_2));
children.push(makeTable(
  ["Variavel", "Valor", "Uso"],
  [
    ["--kc-primary-brand", "#ff6b00", "Laranja principal"],
    ["--kc-primary-brand-light", "#ff8c00", "Hover"],
    ["--kc-bg-dark", "#0f0f13", "Fundo da pagina"],
    ["--kc-surface-dark", "#1a1a22", "Cards, modais"],
    ["--kc-success", "#22c55e", "Status positivo"],
    ["--kc-warning", "#f59e0b", "Alerta"],
    ["--kc-error", "#ef4444", "Erro"],
    ["--kc-info", "#3b82f6", "Informacao"],
  ],
  [3500, 2500, 3360]
));

children.push(heading("5.2. Breakpoints", HeadingLevel.HEADING_2));
children.push(makeTable(
  ["Breakpoint", "Uso"],
  [
    ["max-width: 400px", "Mobile pequeno"],
    ["max-width: 640px", "Mobile/Tablet"],
    ["max-width: 767px", "Tablet"],
    ["min-width: 768px", "Desktop"],
    ["min-width: 1024px", "Desktop grande"],
  ],
  [4000, 5360]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// PARTE 6+7+8
children.push(heading("PARTE 6 - VARIAVEIS DE AMBIENTE", HeadingLevel.HEADING_1));
children.push(makeTable(
  ["Variavel", "Onde", "Descricao"],
  [
    ["SUPABASE_URL", "Vercel", "URL do projeto Supabase"],
    ["SUPABASE_ANON_KEY", "Vercel", "Chave publica do Supabase"],
    ["KC_NOTIFY_HMAC_SECRET", "Supabase", "Segredo HMAC-SHA256 para webhooks"],
    ["ADMIN_REPORTS_WEBHOOK_URL", "Supabase", "URL do webhook de alertas"],
    ["KC_APP_BASE_URL", "Supabase", "URL base do app"],
    ["REPORTS_THRESHOLD", "Supabase", "Numero de denuncias para alerta (default: 3)"],
  ],
  [3800, 1500, 4060]
));

children.push(heading("PARTE 7 - HISTORICO DE VERSOES", HeadingLevel.HEADING_1));
children.push(makeTable(
  ["PR", "Versao", "Descricao"],
  [
    ["#188", "v8.6.x", "Botao Marcar na Agenda com popover multi-calendario"],
    ["#190", "v8.6.x", "Fix: chips do kc-create-modal no mobile"],
    ["#191", "v8.6.x", "Fix: ranking table overflow desktop e mobile"],
    ["#192", "v8.6.x", "Fix: product actions + botao Criar parecido"],
    ["#193", "v8.6.x", "Fix: ranking modal, product actions harmonizados"],
    ["#194", "v9.0.0", "Documentacao tecnica + seguranca (SVG block, magic bytes)"],
  ],
  [1200, 1500, 6660]
));

children.push(heading("PARTE 8 - CONCLUSAO E PROXIMOS PASSOS", HeadingLevel.HEADING_1));
children.push(para("O KinoCampus e uma plataforma funcional e segura com base tecnica solida. As fundacoes do v9 (documentacao e seguranca) ja foram implementadas."));
children.push(emptyLine());
children.push(para([bold("Proximos passos imediatos:")]));
children.push(para("1. Merge do PR #194 (v9.0 fundacoes)"));
children.push(para("2. v9.0.2 - Expandir cobertura de testes para 40%"));
children.push(para("3. v9.0.4 - Criar migrations de retencao de analytics"));
children.push(para("4. v9.1.0 - Implementar sistema de notificacoes in-app"));
children.push(emptyLine());
children.push(para([bold("Decisoes pendentes do proprietario:")]));
children.push(para("- Modelo de negocio do Cashback (v9.3.0)"));
children.push(para("- Priorizacao: filtros avancados vs busca server-side vs threading"));
children.push(para("- Avaliacao de bundler (Vite/Rollup) para v9.4+"));
children.push(emptyLine());
children.push(para([txt("Relatorio gerado por Claude Code (Anthropic) em 02/04/2026. Modelo: Claude Opus 4.6.", { size: 18, color: "888888", italics: true })]));

// ---------- ASSEMBLE ----------
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: accentColor },
        paragraph: { spacing: { before: 300, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [txt("KinoCampus v9.0 - Relatorio Tecnico", { size: 16, color: "999999", italics: true })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [txt("Pagina ", { size: 16, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" })],
      })] }),
    },
    children,
  }],
});

const outPath = process.argv[2] || "RELATORIO-KINOCAMPUS-V9.docx";
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log("OK: " + outPath + " (" + buf.length + " bytes)");
});
