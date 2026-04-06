#!/usr/bin/env python3
"""Gera o PDF do relatorio tecnico KinoCampus v9.0 usando reportlab."""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, black, white, grey
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Frame, PageTemplate, BaseDocTemplate
)
from reportlab.platypus.doctemplate import _doNothing

ACCENT = HexColor("#FF6B00")
DARK_BG = HexColor("#2B2B3D")
LIGHT_BG = HexColor("#F5F5F5")
BORDER_COLOR = HexColor("#CCCCCC")
MUTED = HexColor("#888888")

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(os.path.dirname(OUT_DIR), "RELATORIO-KINOCAMPUS-V9.pdf")

styles = getSampleStyleSheet()

styles.add(ParagraphStyle("CoverTitle", parent=styles["Title"],
    fontName="Helvetica-Bold", fontSize=26, textColor=ACCENT,
    alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle("CoverSubtitle", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=20, alignment=TA_CENTER, spaceAfter=6))
styles.add(ParagraphStyle("CoverMeta", parent=styles["Normal"],
    fontName="Helvetica", fontSize=14, textColor=HexColor("#666666"),
    alignment=TA_CENTER, spaceAfter=20))

styles.add(ParagraphStyle("H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=18, textColor=ACCENT,
    spaceBefore=24, spaceAfter=10, borderWidth=0))
styles.add(ParagraphStyle("H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=14, textColor=black,
    spaceBefore=16, spaceAfter=8))
styles.add(ParagraphStyle("H3", parent=styles["Heading3"],
    fontName="Helvetica-Bold", fontSize=12, textColor=HexColor("#333333"),
    spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle("Body", parent=styles["Normal"],
    fontName="Helvetica", fontSize=10, leading=14, spaceAfter=6))
styles.add(ParagraphStyle("BodyBold", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=10, leading=14, spaceAfter=6))
styles.add(ParagraphStyle("KCCode", parent=styles["Normal"],
    fontName="Courier", fontSize=8, leading=10, spaceAfter=4,
    leftIndent=12, textColor=HexColor("#333333"),
    backColor=HexColor("#F0F0F0")))
styles.add(ParagraphStyle("Footer", parent=styles["Normal"],
    fontName="Helvetica", fontSize=8, textColor=MUTED, alignment=TA_CENTER))
styles.add(ParagraphStyle("HeaderR", parent=styles["Normal"],
    fontName="Helvetica-Oblique", fontSize=8, textColor=MUTED, alignment=TA_RIGHT))
styles.add(ParagraphStyle("TableCell", parent=styles["Normal"],
    fontName="Helvetica", fontSize=9, leading=12, spaceAfter=0))
styles.add(ParagraphStyle("TableHeader", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=white, spaceAfter=0))
styles.add(ParagraphStyle("ListItem", parent=styles["Normal"],
    fontName="Helvetica", fontSize=10, leading=14, spaceAfter=4,
    leftIndent=20, bulletIndent=8))


def p(text, style="Body"):
    return Paragraph(text, styles[style])

def bold_p(text):
    return Paragraph(text, styles["BodyBold"])

def make_table(headers, rows, col_widths=None):
    """Cria tabela formatada."""
    w = col_widths or [None] * len(headers)
    data = [[Paragraph(h, styles["TableHeader"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), styles["TableCell"]) for c in row])

    t = Table(data, colWidths=w, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BACKGROUND", (0, 1), (-1, -1), white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT_BG]),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Oblique", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(doc.width + doc.leftMargin, doc.height + doc.topMargin + 14,
                           "KinoCampus v9.0 - Relatorio Tecnico")
    canvas.drawCentredString(doc.width / 2 + doc.leftMargin, 36,
                             f"Pagina {doc.page}")
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        OUT_PATH, pagesize=letter,
        leftMargin=1*inch, rightMargin=1*inch,
        topMargin=1*inch, bottomMargin=1*inch,
    )

    story = []
    W = doc.width  # usable width

    # ============ CAPA ============
    story.append(Spacer(1, 1.5*inch))
    story.append(p("RELATORIO TECNICO", "CoverTitle"))
    story.append(p("KINOCAMPUS v9.0", "CoverSubtitle"))
    story.append(p("Plataforma de Comunidade Universitaria da UFG", "CoverMeta"))
    story.append(Spacer(1, 0.5*inch))

    meta_data = [
        ["Data:", "02 de abril de 2026"],
        ["Versao:", "9.0.0 (Fundacoes)"],
        ["Autor tecnico:", "Claude Code (Anthropic) sob direcao de Yan Diamantino"],
        ["Plataforma:", "https://www.kinocampus.com.br"],
    ]
    for label, val in meta_data:
        story.append(Paragraph(f"<b>{label}</b> {val}", styles["Body"]))

    story.append(PageBreak())

    # ============ PARTE 1 ============
    story.append(p("PARTE 1 - DIAGNOSTICO E ESTADO ATUAL", "H1"))

    story.append(p("1.1. Sobre a Plataforma", "H2"))
    story.append(p("O KinoCampus e uma plataforma digital de comunidade universitaria exclusiva para a Universidade Federal de Goias (UFG). Conecta alunos, professores e egressos em 6 modulos tematicos:"))
    story.append(Spacer(1, 4))
    story.append(make_table(
        ["Modulo", "Proposito", "Exemplo de uso"],
        [
            ["Compra e Venda", "Marketplace de produtos", "Vender livros usados, eletronicos"],
            ["Caronas", "Ofertas e pedidos de carona", "Carona para o campus"],
            ["Moradia", "Anuncios de moradia", "Quartos perto da UFG, republicas"],
            ["Eventos", "Agenda de eventos", "Workshops, festas, palestras"],
            ["Oportunidades", "Vagas e oportunidades", "Estagios, monitorias, voluntariado"],
            ["Achados e Perdidos", "Itens perdidos/encontrados", "Documentos perdidos no campus"],
        ],
        [1.5*inch, 1.8*inch, W - 3.3*inch]
    ))
    story.append(Spacer(1, 6))
    story.append(p("<b>Restricao de acesso:</b> Apenas e-mails institucionais (@ufg.br, @discente.ufg.br, @egresso.ufg.br)."))

    story.append(p("1.2. Stack Tecnologica", "H2"))
    story.append(make_table(
        ["Camada", "Tecnologia"],
        [
            ["Frontend", "HTML5 + CSS3 + Vanilla JS (55+ modulos IIFE, sem framework/bundler)"],
            ["Backend", "Supabase (PostgreSQL 17 + Auth + Storage + Edge Functions + Realtime)"],
            ["Hosting", "Vercel (static site + serverless OG images)"],
            ["Dominio", "kinocampus.com.br (Hostinger, DNS para Vercel)"],
            ["Build", "node scripts/inject-env.js (substitui placeholders)"],
            ["Testes", "Jest: 7 arquivos, 31 testes, &lt;5% cobertura"],
            ["CSS", "5 arquivos (~12.500 linhas), dark mode com custom properties"],
            ["Icones", "Font Awesome 6 (CDN)"],
        ],
        [1.3*inch, W - 1.3*inch]
    ))

    story.append(p("1.3. Arquitetura JS", "H2"))
    story.append(p("O frontend usa o padrao IIFE + window.*: cada modulo e uma funcao auto-executavel que expoe metodos publicos globalmente."))
    story.append(Spacer(1, 4))
    story.append(make_table(
        ["Categoria", "Arquivos", "Tamanho"],
        [
            ["Core/Utils", "kc-utils.js, kc-core.js, kc-constants.js, kc-api.client.js", "~221 KB"],
            ["Auth/Profile", "kc-auth.ui.js, kc-supabase.client.js, account-profile.shared.js", "~114 KB"],
            ["Features", "kc-create-post.js, kc-comments.js, kc-search.js, kc-ranking.js", "~196 KB"],
            ["Controllers", "22 arquivos (product 114KB, admin-dashboard 85KB, etc.)", "~772 KB"],
            ["Adapters", "supabase.adapter.js, local.adapter.js", "~100 KB"],
            ["TOTAL", "39 arquivos principais", "~1.4 MB"],
        ],
        [1.3*inch, W - 2.1*inch, 0.8*inch]
    ))

    story.append(p("1.4. Banco de Dados (16 tabelas)", "H2"))
    story.append(make_table(
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
        [1.4*inch, W - 1.4*inch]
    ))
    story.append(Spacer(1, 6))
    story.append(p("<b>Seguranca:</b> RLS em todas as tabelas (53+ politicas), HMAC-SHA256, search_path=public, rate limiting, audit log."))
    story.append(p("<b>RPCs:</b> 65+ funcoes (kc_bump_post, kc_renew_post, kc_expire_old_posts, kc_get_top_contributors, etc.)."))
    story.append(p("<b>pg_cron:</b> Job diario as 03:00 para expirar posts automaticamente."))

    story.append(p("1.5. Ranking (Gamificacao)", "H2"))
    story.append(make_table(
        ["Acao", "Pontos"],
        [
            ["Criar post", "+15"],
            ["Receber voto positivo", "+10"],
            ["Escrever comentario", "+5"],
            ["Post acessado (CTA clicado)", "+4"],
            ["Post compartilhado", "+3"],
            ["Denuncia confirmada (penalidade)", "-50"],
        ],
        [W - 1.5*inch, 1.5*inch]
    ))
    story.append(p("<b>Anti-spam:</b> Cada acao contabilizada uma unica vez por publicacao."))

    story.append(p("1.6. Gaps Identificados (Pre-v9)", "H2"))
    story.append(make_table(
        ["Prioridade", "Gap", "Impacto"],
        [
            ["Critica", "Cobertura de testes &lt;5%", "Regressoes nao detectadas"],
            ["Critica", "Sem notificacoes in-app", "Usuarios sem feedback de interacoes"],
            ["Alta", "Sem threading em comentarios", "Conversas confusas"],
            ["Alta", "Paginacao indefinida", "Performance com 1000+ posts"],
            ["Media", "Sem filtros avancados", "Dificil encontrar posts especificos"],
            ["Media", "Sem avaliacoes de usuarios", "Falta sinal de confianca"],
            ["Baixa", "Cashback in-development", "Teaser sem backend"],
        ],
        [1.2*inch, 2.4*inch, W - 3.6*inch]
    ))

    story.append(PageBreak())

    # ============ PARTE 2 ============
    story.append(p("PARTE 2 - O QUE FOI IMPLEMENTADO (v9.0)", "H1"))

    story.append(p("2.1. PR #194 - Fundacoes v9.0", "H2"))
    story.append(p("<b>Branch:</b> feat/v9-0-foundations (baseada em kinocampus-V8.2-SANEAMENTO-QA)"))
    story.append(p("<b>Status:</b> Mergeado em 02/04/2026"))
    story.append(p("<b>Arquivos alterados:</b> 10 (2 modificados + 8 novos)"))

    story.append(p("2.1.1. Documentacao Tecnica (v9.0.1) - CONCLUIDO", "H3"))
    story.append(make_table(
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
        [2*inch, W - 2*inch]
    ))
    story.append(p("<b>Total:</b> ~1.500 linhas de documentacao tecnica."))

    story.append(p("2.1.2. Correcoes de Seguranca (v9.0.3) - CONCLUIDO", "H3"))
    story.append(p("<b>1. Bloqueio de SVG em Uploads:</b> SVGs podem conter JavaScript malicioso (XSS). Removido image/svg+xml dos tipos permitidos em uploads de post media e avatar. Tipos aceitos: JPEG, PNG, WebP, GIF."))
    story.append(p("<b>2. Validacao de Magic Bytes:</b> Nova funcao checkImageMagicBytes(blob) valida os primeiros 12 bytes do arquivo para verificar o tipo real. Previne ataques com arquivos maliciosos renomeados como imagens."))
    story.append(p("<b>3. Invalidacao de Cache:</b> SESSION_STORE_VERSION atualizado de 8.3.4.5 para 9.0.0. Forca revalidacao de sessoes em upgrade major."))

    story.append(PageBreak())

    # ============ PARTE 3 ============
    story.append(p("PARTE 3 - ROTEIRO COMPLETO v9", "H1"))

    story.append(p("3.1. Principios", "H2"))
    principles = [
        "Evolutivo, nao reescrita - cada feature branch e pequena, testavel, revertivel",
        "Test-first nas novas features - cobertura nova vai junto com o codigo",
        "Documentar ao construir - nao existe 'vou documentar depois'",
        "Mobile-first em tudo - 60%+ dos usuarios sao mobile",
        "Seguranca nao negocia - qualquer mudanca em RLS passa por review manual",
        "Performance como feature - bundles grandes prejudicam conexoes lentas",
        "Preservar padroes existentes - IIFE + window.* ate migracao ESM",
    ]
    for i, pr in enumerate(principles, 1):
        story.append(p(f"<b>{i}.</b> {pr}"))

    story.append(p("3.2. Fases", "H2"))
    story.append(make_table(
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
        [0.8*inch, W - 1.9*inch, 1.1*inch]
    ))

    story.append(p("3.3. Detalhes das Proximas Fases", "H2"))

    story.append(p("v9.1.0 - Notificacoes In-App", "H3"))
    story.append(p("<b>Backend:</b> Nova tabela notifications com RLS (usuario ve apenas suas proprias). Triggers para comentarios em posts proprios, votos positivos (throttle 1/hora), e expiracao de posts."))
    story.append(p("<b>Frontend:</b> Novo modulo kc-notifications.js. Icone de sino no header com badge. Dropdown com avatar + texto + timestamp. Supabase Realtime. Deep links."))

    story.append(p("v9.1.1 - Comment Threading", "H3"))
    story.append(p("Coluna parent_id na tabela comments. Limite de 1 nivel de profundidade (estilo Instagram). Renderizacao indentada com borda lateral."))

    story.append(p("v9.1.2 - Avaliacoes", "H3"))
    story.append(p("Nova tabela user_ratings (1-5 estrelas + texto curto, max 280 chars). Rating medio no perfil e seller card. Apenas quem interagiu pode avaliar."))

    story.append(p("v9.2.0 - Busca Server-Side", "H3"))
    story.append(p("Indice GIN para full-text search em portugues. RPC kc_search_posts com ts_rank. Sinonimos expandidos client-side antes de enviar ao RPC."))

    story.append(p("v9.2.1 - Filtros Avancados", "H3"))
    story.append(p("Por modulo: range de preco, data, tipo, regiao. Persistencia em URL params. Accordion desktop, drawer mobile."))

    story.append(p("v9.2.2 - Paginacao Cursor-Based", "H3"))
    story.append(p("Melhor que offset para feeds com insercoes frequentes. Retorna posts + nextCursor + hasMore. Botao 'Carregar mais'."))

    story.append(p("v9.3.1 - Analytics de Post", "H3"))
    story.append(p("view_count em posts + tabela post_view_events. Anti-spam: 1 view/usuario/hora. Mini-analytics em Meus Posts."))

    story.append(p("v9.3.2 - Moderacao Automatica", "H3"))
    story.append(p("Flood control (max 3 posts/hora), link spam (&gt;3 URLs = pending), score de confianca para usuarios novos."))

    story.append(PageBreak())

    # ============ PARTE 4 ============
    story.append(p("PARTE 4 - PADROES DE CODIGO E PROCESSOS", "H1"))

    story.append(p("4.1. Padrao IIFE", "H2"))
    story.append(p("Todos os novos modulos JS devem usar IIFE: funcao auto-executavel com 'use strict', funcoes privadas internas, interface publica em window.*, inicializacao no DOMContentLoaded."))

    story.append(p("4.2. Padrao Driver", "H2"))
    story.append(p("KC_ENV.driver seleciona entre SupabaseAdapter (producao) e LocalAdapter (desenvolvimento). KCAPI e a facade que abstrai o storage."))

    story.append(p("4.3. Padrao Popover", "H2"))
    story.append(p("Trio openXPopover/closeXPopover/wireXPopover. CSS reutiliza classes .kc-save-popover. Desktop: dropdown ancorado. Mobile: bottom sheet. Exclusao mutua entre popovers."))

    story.append(p("4.4. Sanitizacao", "H2"))
    story.append(p("<b>OBRIGATORIO:</b> Sempre usar window.KCUtils.escapeHtml() antes de inserir dados de usuario em innerHTML. Nunca inserir conteudo cru (risco XSS)."))

    story.append(p("4.5. Processo de Feature Branch", "H2"))
    steps = [
        "git checkout kinocampus-V8.2-SANEAMENTO-QA &amp;&amp; git pull",
        "git checkout -b feat/nome-da-feature",
        "Implementar + testes + docs",
        "npm test (todos os testes passam)",
        "node scripts/hygiene-check.js",
        "gh pr create --base kinocampus-V8.2-SANEAMENTO-QA",
        "Apos merge: excluir feature branch local e remota",
    ]
    for i, s in enumerate(steps, 1):
        story.append(p(f"<b>{i}.</b> {s}"))

    story.append(p("4.6. Checklist por PR", "H2"))
    story.append(make_table(
        ["Categoria", "Itens"],
        [
            ["Funcionalidade", "npm test, testes novos, mobile 375px + desktop 1440px, dark mode, estados (vazio/loading/erro)"],
            ["Seguranca", "Mutations requerem auth, MIME validado, RLS em novas tabelas, search_path=public"],
            ["Banco", "Migration testada em staging, rollback documentado, indices para queries frequentes"],
        ],
        [1.5*inch, W - 1.5*inch]
    ))

    story.append(PageBreak())

    # ============ PARTE 5 ============
    story.append(p("PARTE 5 - DESIGN SYSTEM", "H1"))

    story.append(p("5.1. Cores", "H2"))
    story.append(make_table(
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
        [2.2*inch, 1.3*inch, W - 3.5*inch]
    ))

    story.append(p("5.2. Breakpoints", "H2"))
    story.append(make_table(
        ["Breakpoint", "Uso"],
        [
            ["max-width: 400px", "Mobile pequeno"],
            ["max-width: 640px", "Mobile/Tablet"],
            ["max-width: 767px", "Tablet"],
            ["min-width: 768px", "Desktop"],
            ["min-width: 1024px", "Desktop grande"],
        ],
        [2.5*inch, W - 2.5*inch]
    ))

    story.append(PageBreak())

    # ============ PARTE 6 ============
    story.append(p("PARTE 6 - VARIAVEIS DE AMBIENTE", "H1"))
    story.append(make_table(
        ["Variavel", "Onde", "Descricao"],
        [
            ["SUPABASE_URL", "Vercel", "URL do projeto Supabase"],
            ["SUPABASE_ANON_KEY", "Vercel", "Chave publica do Supabase"],
            ["KC_NOTIFY_HMAC_SECRET", "Supabase", "Segredo HMAC-SHA256 para webhooks"],
            ["ADMIN_REPORTS_WEBHOOK_URL", "Supabase", "URL do webhook de alertas"],
            ["KC_APP_BASE_URL", "Supabase", "URL base do app"],
            ["REPORTS_THRESHOLD", "Supabase", "Numero de denuncias para alerta (default: 3)"],
        ],
        [2.5*inch, 1*inch, W - 3.5*inch]
    ))

    # ============ PARTE 7 ============
    story.append(p("PARTE 7 - HISTORICO DE VERSOES", "H1"))
    story.append(make_table(
        ["PR", "Versao", "Descricao"],
        [
            ["#188", "v8.6.x", "Botao Marcar na Agenda com popover multi-calendario"],
            ["#190", "v8.6.x", "Fix: chips do kc-create-modal no mobile"],
            ["#191", "v8.6.x", "Fix: ranking table overflow desktop e mobile"],
            ["#192", "v8.6.x", "Fix: product actions + botao Criar parecido"],
            ["#193", "v8.6.x", "Fix: ranking modal, product actions harmonizados"],
            ["#194", "v9.0.0", "Documentacao tecnica + seguranca (SVG block, magic bytes)"],
        ],
        [0.7*inch, 1*inch, W - 1.7*inch]
    ))

    # ============ PARTE 8 ============
    story.append(p("PARTE 8 - CONCLUSAO E PROXIMOS PASSOS", "H1"))
    story.append(p("O KinoCampus e uma plataforma funcional e segura com base tecnica solida. As fundacoes do v9 (documentacao e seguranca) ja foram implementadas e mergeadas (PR #194)."))
    story.append(Spacer(1, 8))
    story.append(p("<b>Proximos passos imediatos:</b>"))
    story.append(p("<b>1.</b> v9.0.2 - Expandir cobertura de testes para 40%"))
    story.append(p("<b>2.</b> v9.0.4 - Criar migrations de retencao de analytics"))
    story.append(p("<b>3.</b> v9.1.0 - Implementar sistema de notificacoes in-app (prioridade maxima)"))
    story.append(Spacer(1, 8))
    story.append(p("<b>Decisoes pendentes do proprietario:</b>"))
    story.append(p("- Modelo de negocio do Cashback (v9.3.0)"))
    story.append(p("- Priorizacao: filtros avancados vs busca server-side vs threading"))
    story.append(p("- Avaliacao de bundler (Vite/Rollup) para v9.4+"))
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "<i>Relatorio gerado por Claude Code (Anthropic) em 02/04/2026. Modelo: Claude Opus 4.6.</i>",
        ParagraphStyle("Footnote", parent=styles["Normal"],
                       fontName="Helvetica-Oblique", fontSize=8, textColor=MUTED)))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"OK: {OUT_PATH} ({os.path.getsize(OUT_PATH)} bytes)")


if __name__ == "__main__":
    build()
