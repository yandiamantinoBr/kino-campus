"""
cadu-api 0.5.5 — executor da pipeline (Curador UFG 4.4).

Permite disparar e acompanhar os estágios da pipeline do Cadu (OpenClaw)
via REST API + Server-Sent Events.

Estágios pré-definidos (catálogo PIPELINE_STAGES abaixo):
  - curator:     varredura sites UFG Tier 1+2 (cadu-curador-v4.4 --daily)
  - ig:          scanner Instagram via browser CDP (scan-ig-browser.js)
  - duplicates:  enriquecimento de duplicatas (enrich-duplicates.js)
  - format:      formatador IA (formatador-ia.js)
  - publish:     publicação real via Edge Function cadu-publish
  - enrich:      enriquecimento de imagens (enrich-images.js --from-recent 20)
  - dedup:       dedup visual + textual (dedup-kino.js)
  - sigaa:       sync calendário SIGAA (sigaa/sync_calendar.js)
  - all:         pipeline completa (pipeline-kino.js com estágios explícitos)

v0.5.5 — catálogo executável e diagnósticos por fonte:
  - Vincula cada coletor web ao ID estável do catálogo e registra seu resultado por execução
  - Expõe ao admin somente diagnósticos assinados que correspondem ao catálogo embarcado
  - Revalida revisões pendentes contra catálogo e overrides atuais
  - Trata somente o 416/PGRST103 coerente como página vazia
  - Envia chaves Supabase opacas somente no cabeçalho apikey

v0.5.3 — compatibilidade do feed e Unicode público:
  - Recupera dos bytes do artefato a serialização compacta assinada pelo Curator
  - Preserva números/escapes do JSON.stringify e sanitiza texto público para Unicode válido

v0.5.2 — segurança de artefatos e prontidão operacional:
  - Todo dry-run usa workspace efêmero e preserva a cadeia canônica
  - Artefatos determinísticos usam substituição atômica, inclusive sobre legados root-owned
  - Readiness prova, como UID/GID 1000, acesso seguro às pastas ativas de artefatos
  - Relatório SIGAA sai do mount somente leitura; OAuth valida arquivo e diretório pai

v0.5.1 — correções críticas:
  - Dedup: rejeita novo run se já existe run do mesmo stage em status running/pending
  - Polling correto: monitora proc.poll() em vez de os.kill(pid, 0)
    (o PID retornado pelo Popen é do `docker exec` no namespace cadu-api, que
     morre após o bash `exec node` — antes do node real terminar)
  - Stop robusto: usa proc.terminate() no Popen handle
  - SSE heartbeat: envia ":keepalive" a cada 15s pra evitar timeout de proxies
  - Cleanup: limita histórico a 100 runs mais recentes

Como funciona:
  1. cadu-api spawna subprocess via `docker exec --user 1000:1000
     openclaw-hahq-openclaw-1 bash -c
     "cd /data/.openclaw/workspace && node scripts/...js"`.
  2. Cada run tem UUID; stdout+stderr são gravados em
     /data/cadu-pipeline-logs/{run_id}.log (volume persistente).
  3. Estado persistido em SQLite (/data/cadu-pipeline.db):
     runs(id, stage, status, started_at, finished_at, exit_code, log_path,
          pid, submitted_by, message).
  4. Popen handle mantido em memória (dict _RUN_HANDLES) pra permitir poll/terminate.
  5. SSE endpoint (GET /api/pipeline/{run_id}/stream) faz tail do arquivo
     de log e emite eventos line-by-line até o processo terminar.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import os
import re
import shlex
import sqlite3
import stat
import subprocess
import threading
import time
import unicodedata
import urllib.parse
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import Optional
from zoneinfo import ZoneInfo

try:
    import fcntl
except ImportError:  # Windows local tests; producao roda Linux.
    fcntl = None

# ---------- Config ----------

CADU_API_VERSION = "0.5.5"
CURATOR_VERSION = "4.4"
PIPELINE_ARTIFACT_MAX_BYTES = 16 * 1024 * 1024
PIPELINE_URL_IDENTITY_VERSION = "cadu-url-identity-v2"
PIPELINE_ARTIFACT_VALIDATOR_RELATIVE = (
    "scripts/lib/pipeline-artifact-validator.js"
)
PIPELINE_ARTIFACT_DIRECTORY_PROBE_RELATIVE = (
    "scripts/lib/artifact-directory-readiness.js"
)
PIPELINE_SAFE_DIRECTORY_RELATIVE = "scripts/lib/safe-directory.js"
PIPELINE_ARTIFACT_PATHS_MARKER = "__CADU_ARTIFACT_PATHS_JSON__"
PIPELINE_ARTIFACT_RECEIPT_MAX_BYTES = 64 * 1024
_PIPELINE_TRACKING_PARAMETER_RE = re.compile(
    r"^(?:utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid)$",
    re.IGNORECASE,
)
_CURATOR_SOURCE_ARTIFACT_RE = re.compile(
    r"^curadoria-v4[.]4-(?P<mode>daily|full|ig-only|quick)-"
    r"(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2})"
    r"(?:--(?P<run_id>[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}))?[.]json$"
)

OPENCLAW_CONTAINER = os.getenv("OPENCLAW_CONTAINER", "openclaw-hahq-openclaw-1")
# O volume /data/.openclaw e os processos normais do gateway pertencem ao
# usuario node (UID/GID 1000). Fixar a identidade aqui evita que verificacoes e
# runs da pipeline criem bancos/artefatos root-owned e derrubem o gateway.
OPENCLAW_RUNTIME_USER = "1000:1000"
OPENCLAW_WORKSPACE_CONTAINER = os.getenv(
    "OPENCLAW_WORKSPACE_CONTAINER", "/data/.openclaw/workspace"
)
# Diretório de logs dos runs (relativo ao HOST — montado como /data no cadu-api)
PIPELINE_WORKSPACE_PATH = Path(os.getenv("OPENCLAW_WORKSPACE", OPENCLAW_WORKSPACE_CONTAINER))
PIPELINE_LOG_DIR = Path(os.getenv("CADU_PIPELINE_LOG_DIR", "/data/cadu-pipeline-logs"))
PIPELINE_DB_PATH = Path(os.getenv("CADU_PIPELINE_DB", "/data/cadu-pipeline.db"))
PIPELINE_RUNTIME_DIR = Path(
    os.getenv("CADU_PIPELINE_RUNTIME_DIR", "/data/cadu-pipeline-runtime")
)
PIPELINE_RUNTIME_DIR_CONTAINER = os.getenv(
    "CADU_PIPELINE_RUNTIME_DIR_CONTAINER", "/data/cadu-pipeline-runtime"
)
PIPELINE_MAINTENANCE_LOCK_DIR = Path(
    os.getenv("OPENCLAW_MAINTENANCE_LOCK_DIR", "/run/lock/openclaw-cadu")
)
PIPELINE_CDP_MAINTENANCE_LOCK = (
    PIPELINE_MAINTENANCE_LOCK_DIR / "ensure-browser-cdp.lock"
)
PIPELINE_DEPLOY_LOCK = PIPELINE_MAINTENANCE_LOCK_DIR / "git-sync.lock"
PIPELINE_ARTIFACT_DIRS_CONTAINER = (
    f"{OPENCLAW_WORKSPACE_CONTAINER.rstrip('/')}/data",
    f"{OPENCLAW_WORKSPACE_CONTAINER.rstrip('/')}/data/ufg-scrape",
    f"{OPENCLAW_WORKSPACE_CONTAINER.rstrip('/')}/data/ufg-instagram",
)
PIPELINE_OPTIONAL_ARTIFACT_DIRS_CONTAINER = (
    f"{OPENCLAW_WORKSPACE_CONTAINER.rstrip('/')}/data/dedup-reports",
    f"{OPENCLAW_WORKSPACE_CONTAINER.rstrip('/')}/data/sigaa",
)

# git-sync's authenticated HTTP client waits five seconds for response headers.
# Keep every controlled blocking operation under one smaller budget so a valid
# readiness response can still be serialized before that caller gives up.
PIPELINE_READINESS_TOTAL_TIMEOUT_SEC = 4.0
_PIPELINE_READINESS_DB_TIMEOUT_SEC = 0.5
_PIPELINE_READINESS_INSPECT_TIMEOUT_SEC = 1.0
_PIPELINE_READINESS_EXEC_TIMEOUT_SEC = 2.25

# Histórico máximo (cleanup automático ao inserir novo run)
PIPELINE_MAX_HISTORY = int(os.getenv("CADU_PIPELINE_MAX_HISTORY", "100"))

# Limites defensivos para logs. Os valores cobrem com folga os tails usados pela
# UI (80/180 linhas), mas impedem que uma linha JSON enorme ou um log histórico
# inteiro bloqueie o event loop do cadu-api.
PIPELINE_LOG_TAIL_MAX_LINES = max(
    1, min(int(os.getenv("CADU_PIPELINE_LOG_TAIL_MAX_LINES", "2000")), 10000),
)
PIPELINE_LOG_TAIL_MAX_BYTES = max(
    4096, min(int(os.getenv("CADU_PIPELINE_LOG_TAIL_MAX_BYTES", str(512 * 1024))), 4 * 1024 * 1024),
)
PIPELINE_LOG_SCAN_HEAD_BYTES = max(
    4096, min(int(os.getenv("CADU_PIPELINE_LOG_SCAN_HEAD_BYTES", str(64 * 1024))), 1024 * 1024),
)
PIPELINE_LOG_SCAN_TAIL_BYTES = max(
    4096, min(int(os.getenv("CADU_PIPELINE_LOG_SCAN_TAIL_BYTES", str(256 * 1024))), 2 * 1024 * 1024),
)
PIPELINE_SUMMARY_MAX_TEXT_CHARS = max(
    32768, min(int(os.getenv("CADU_PIPELINE_SUMMARY_MAX_TEXT_CHARS", str(512 * 1024))), 4 * 1024 * 1024),
)
PIPELINE_SUMMARY_MAX_LINE_CHARS = max(
    4096, min(int(os.getenv("CADU_PIPELINE_SUMMARY_MAX_LINE_CHARS", str(32 * 1024))), 256 * 1024),
)
PIPELINE_ORPHAN_LOG_GRACE_SEC = max(
    60, int(os.getenv("CADU_PIPELINE_ORPHAN_LOG_GRACE_SEC", "3600")),
)

# SSE heartbeat: envia ":keepalive" a cada N segundos pra evitar timeout de proxies
SSE_HEARTBEAT_SEC = float(os.getenv("CADU_PIPELINE_SSE_HEARTBEAT", "15"))
PIPELINE_SSE_INITIAL_BACKLOG_BYTES = max(
    4096, min(int(os.getenv("CADU_PIPELINE_SSE_INITIAL_BACKLOG_BYTES", str(256 * 1024))), 2 * 1024 * 1024),
)
PIPELINE_SSE_READ_CHUNK_BYTES = max(
    1024, min(int(os.getenv("CADU_PIPELINE_SSE_READ_CHUNK_BYTES", str(64 * 1024))), 512 * 1024),
)
PIPELINE_SSE_MAX_LINES_PER_TICK = max(
    1, min(int(os.getenv("CADU_PIPELINE_SSE_MAX_LINES_PER_TICK", "500")), 5000),
)
PIPELINE_SSE_MAX_LINE_BYTES = max(
    1024, min(int(os.getenv("CADU_PIPELINE_SSE_MAX_LINE_BYTES", str(32 * 1024))), 256 * 1024),
)
PIPELINE_SSE_MAX_CONNECTIONS = max(
    1, min(int(os.getenv("CADU_PIPELINE_SSE_MAX_CONNECTIONS", "16")), 128),
)

# Health/watchdog: limites para marcar a automacao como atrasada.
PIPELINE_HEALTH_WARN_AFTER_SEC = int(os.getenv("CADU_PIPELINE_HEALTH_WARN_AFTER_SEC", str(36 * 3600)))
PIPELINE_HEALTH_CRITICAL_AFTER_SEC = int(os.getenv("CADU_PIPELINE_HEALTH_CRITICAL_AFTER_SEC", str(72 * 3600)))
PIPELINE_HEALTH_FAILURE_WINDOW_SEC = int(os.getenv("CADU_PIPELINE_HEALTH_FAILURE_WINDOW_SEC", str(24 * 3600)))

# Override de estimativas por stage (env vars opcionais, 2026-07-10).
# Formato: "stage1:sec1,stage2:sec2" — sobrescreve o estimated_sec hardcoded abaixo.
# Util pra estender timeout estimado SEM deploy de codigo (Yan pediu 1200s no 'all').
PIPELINE_ESTIMATED_OVERRIDES: dict[str, int] = {}
for _pair in os.getenv("CADU_PIPELINE_ESTIMATED_OVERRIDES", "").split(","):
    _pair = _pair.strip()
    if not _pair or ":" not in _pair:
        continue
    _stage, _sec = _pair.split(":", 1)
    try:
        PIPELINE_ESTIMATED_OVERRIDES[_stage.strip()] = int(_sec.strip())
    except ValueError:
        pass

# Hard orphan/runtime ceilings — independent of UI estimated_sec.
# Format: "stage1:sec1,stage2:sec2". Defaults preserve the Jul-20 incident
# containment floors (curator 1800, ig 2400, all 3000 effective).
PIPELINE_MAX_RUNTIME_OVERRIDES: dict[str, int] = {}
for _pair in os.getenv("CADU_PIPELINE_MAX_RUNTIME_OVERRIDES", "").split(","):
    _pair = _pair.strip()
    if not _pair or ":" not in _pair:
        continue
    _stage, _sec = _pair.split(":", 1)
    try:
        PIPELINE_MAX_RUNTIME_OVERRIDES[_stage.strip()] = int(_sec.strip())
    except ValueError:
        pass

# Defaults used when no override is set. estimated_sec remains UI-only.
_PIPELINE_DEFAULT_MAX_RUNTIME_SEC: dict[str, int] = {
    "curator": 1800,
    "ig": 2400,
    # Fatal orphan ceiling only. The complete pipeline runs the IG and full
    # curator supervisors sequentially (up to 40m each) before downstream
    # stages, so the old 50m ceiling could kill a healthy in-contract run.
    "all": 7200,
    "format": 900,
    "duplicates": 600,
    "publish": 600,
    "enrich": 600,
    "dedup": 600,
    "sigaa": 400,
}

# ---------- Catalogo de estagios pre-definidos ----------

@dataclass(frozen=True)
class PipelineStage:
    id: str
    name: str
    description: str
    script: str  # caminho relativo a /data/.openclaw/workspace
    args: tuple  # args fixos (não customizáveis via API por enquanto)
    estimated_sec: int  # estimativa pra mostrar na UI
    category: str  # "scan" | "process" | "publish" | "maintenance"


PIPELINE_STAGES: dict[str, PipelineStage] = {
    "curator": PipelineStage(
        id="curator",
        name=f"Curador UFG {CURATOR_VERSION}",
        description="Varre sites UFG dos níveis 1 e 2 no modo diário e classifica itens publicáveis",
        script="scripts/pipeline-kino.js",
        args=("--stage=curator",),
        # 2026-07-10 (Mavis): 90s -> 180s. 97 sites no ufg-sites-map.md,
        # scan ficou mais lento com enrichment.
        estimated_sec=180,
        category="scan",
    ),
    "ig": PipelineStage(
        id="ig",
        name="Scanner Instagram",
        description="Varre perfis institucionais da UFG pelo navegador CDP e enriquece publicações relevantes",
        script="scripts/scan-ig-browser.js",
        args=(),
        estimated_sec=420,
        category="scan",
    ),
    "duplicates": PipelineStage(
        id="duplicates",
        name="Enriquecimento de duplicatas",
        description="Atualiza posts existentes com informações novas de itens descartados",
        script="scripts/pipeline-kino.js",
        args=("--stage=duplicates",),
        estimated_sec=60,
        category="process",
    ),
    "format": PipelineStage(
        id="format",
        name="Formatador IA",
        description="Gera descrições canônicas a partir do _truly_new do dia",
        script="scripts/pipeline-kino.js",
        args=("--stage=format",),
        # 2026-07-10: 120s -> 300s. DeepSeek requests with bounded retries
        # + retry 5x (10s/20s/40s/80s/160s) pode demorar bastante.
        estimated_sec=300,
        category="process",
    ),
    "publish": PipelineStage(
        id="publish",
        name="Publicação",
        description="Publica o _formatted do dia via Edge Function cadu-publish",
        script="scripts/pipeline-kino.js",
        args=("--stage=publish",),
        estimated_sec=60,
        category="publish",
    ),
    "enrich": PipelineStage(
        id="enrich",
        name="Enriquecimento de imagens",
        description="Adiciona imagens complementares aos posts publicados",
        script="scripts/enrich-images.js",
        args=("--from-recent", "20"),
        estimated_sec=90,
        category="process",
    ),
    "dedup": PipelineStage(
        id="dedup",
        name="Deduplicação visual e textual",
        description="Detecta publicações duplicadas por pHash e similaridade textual Jaccard",
        script="scripts/dedup-kino.js",
        args=(),
        estimated_sec=120,
        category="maintenance",
    ),
    "sigaa": PipelineStage(
        id="sigaa",
        name="Sincronização SIGAA → Google Agenda",
        description="Sincroniza tarefas do SIGAA com o Google Agenda (~90 s)",
        script="scripts/sigaa/sync_calendar.js",
        args=(),
        estimated_sec=100,
        category="maintenance",
    ),
    "all": PipelineStage(
        id="all",
        name="Pipeline completa",
        description="Instagram + Curador completo (níveis 1–3) + Duplicatas + Formatação + Publicação + Enriquecimento",
        script="scripts/pipeline-kino.js",
        # A ação denominada "completa" precisa usar o modo full que o
        # orquestrador já oferece; sem esta flag ela executava --daily e omitia
        # silenciosamente todo o Tier 3. O estágio isolado `curator` continua
        # diário para preservar seu custo operacional habitual.
        args=(
            # Fix E (2026-07-23): adiciona --stage=enrich-instagram para o
            # orquestrador rodar cache-instagram-images (Fix A) + enrich-instagram-
            # with-official-source (Fix B) entre cross-match e format. Sem isso,
            # items IG ficam sem imagem persistida e sem source oficial,
            # batendo QUALITY_BLOCKED em only_temporary_or_svg_images +
            # instagram_without_official_source na Edge Function cadu-publish.
            "--stage=ig", "--stage=curator", "--stage=duplicates",
            "--stage=enrich-instagram",
            "--stage=format", "--stage=publish", "--stage=enrich", "--full",
        ),
        # A execução diária de referência já levou ~26 min. O modo realmente
        # completo inclui também 25 fontes Tier 3; 35 min é uma estimativa
        # conservadora para a UI, não um timeout do processo.
        # Estimativa UI apenas; nao ha hard timeout real - apenas SSE keepalive.
        estimated_sec=2100,
        category="publish",
    ),
}

# 2026-07-10 (Mavis): aplica overrides via env var (CADU_PIPELINE_ESTIMATED_OVERRIDES)
# Formato: "curator:240,all:1500". Util pra ajustar sem deploy.
# Usa object.__setattr__ porque PipelineStage e @dataclass(frozen=True).
for _stage_id, _stage in PIPELINE_STAGES.items():
    if _stage_id in PIPELINE_ESTIMATED_OVERRIDES:
        object.__setattr__(_stage, "estimated_sec", PIPELINE_ESTIMATED_OVERRIDES[_stage_id])


def stage_max_runtime_sec(stage: Optional["PipelineStage"], stage_id: Optional[str] = None) -> int:
    """Fatal orphan/runtime ceiling. Never use estimated_sec alone for kills."""
    sid = stage_id or (stage.id if stage else None) or ""
    if sid in PIPELINE_MAX_RUNTIME_OVERRIDES:
        return max(60, PIPELINE_MAX_RUNTIME_OVERRIDES[sid])
    if sid in _PIPELINE_DEFAULT_MAX_RUNTIME_SEC:
        return _PIPELINE_DEFAULT_MAX_RUNTIME_SEC[sid]
    estimate = stage.estimated_sec if stage else 3600
    # Conservative fallback: UI estimate + 15 min buffer, never below 15 min.
    return max(900, int(estimate) + 900)


PIPELINE_STAGE_PROFILES: dict[str, dict] = {
    "curator": {
        "risk": "low",
        "mode": "scan",
        "mutates_platform": False,
        "dry_run_available": True,
        "effects": ["workspace_artifacts", "supabase_read"],
        "requirements": ["supabase_key"],
        "notes": [
            "Execução real gera relatório canônico e consulta o cache de posts publicados.",
            "Dry-run faz as leituras e classifica, mas não grava artefato canônico.",
        ],
    },
    "ig": {
        "risk": "medium",
        "mode": "scan",
        "mutates_platform": False,
        "dry_run_available": True,
        "effects": ["browser_cdp", "workspace_artifacts", "ig_seen_cache"],
        "requirements": ["browser_cdp"],
        "notes": [
            "Depende do Chrome/CDP autenticado no contêiner do OpenClaw.",
            "A etapa isolada enriquece legendas e datas; a pipeline completa usa --skip-enrich para controlar o consumo de recursos.",
        ],
    },
    "duplicates": {
        "risk": "high",
        "mode": "process",
        "mutates_platform": True,
        "dry_run_available": True,
        "effects": ["supabase_update", "post_media_insert"],
        "requirements": ["supabase_key", "kino_credentials"],
        "notes": ["Sem --dry-run, atualiza metadados, capas e imagens de publicações existentes."],
    },
    "format": {
        "risk": "medium",
        "mode": "process",
        "mutates_platform": False,
        "dry_run_available": False,
        "effects": ["ai_api", "workspace_artifacts"],
        "requirements": ["deepseek_key"],
        "notes": ["Exige _truly_new_YYYY-MM-DD.json íntegro e recente; a reutilização automática de curadoria antiga é bloqueada."],
    },
    "publish": {
        "risk": "high",
        "mode": "publish",
        "mutates_platform": True,
        "dry_run_available": True,
        "effects": ["edge_publish", "supabase_insert", "supabase_update"],
        "requirements": ["supabase_key", "kino_credentials"],
        "notes": ["Requer _formatted_YYYY-MM-DD.json fresco; sem --dry-run, chama cadu-publish e pode publicar/mesclar posts reais."],
    },
    "enrich": {
        "risk": "high",
        "mode": "process",
        "mutates_platform": True,
        "dry_run_available": True,
        "effects": ["supabase_update", "post_media_insert"],
        "requirements": ["supabase_key", "kino_credentials"],
        "notes": ["Sem --dry-run, adiciona mídias e atualiza metadados de publicações existentes."],
    },
    "dedup": {
        "risk": "low",
        "mode": "maintenance",
        "mutates_platform": False,
        "dry_run_available": True,
        "default_dry_run": True,
        "force_dry_run": True,
        "effects": ["supabase_read", "ai_api", "workspace_report"],
        "requirements": ["supabase_key", "kino_credentials"],
        "optional_requirements": ["deepseek_key"],
        "notes": ["O comando catalogado não usa --apply; por padrão, gera relatório sem alterar o Supabase."],
    },
    "sigaa": {
        "risk": "high",
        "mode": "maintenance",
        "mutates_platform": True,
        "dry_run_available": True,
        "effects": ["sigaa_login", "captcha_solver", "google_calendar_write"],
        "requirements": ["google_calendar", "sigaa_credentials", "capsolver_key"],
        "notes": ["O script de produção contém configuração sensível; não o versione antes de mover os segredos para variáveis de ambiente."],
    },
    "all": {
        "risk": "high",
        "mode": "publish",
        "mutates_platform": True,
        "dry_run_available": True,
        "effects": ["browser_cdp", "ai_api", "supabase_update", "edge_publish", "workspace_artifacts"],
        "requirements": ["supabase_key", "kino_credentials", "deepseek_key", "browser_cdp"],
        "notes": [
            "Encadeia varredura, curadoria, duplicatas, formatação, publicação e enriquecimento; execuções recentes ficam perto de 500-600s.",
            "No dry-run completo, artefatos e cache ficam isolados e são removidos ao final. O enriquecimento fica explicitamente bloqueado enquanto o publicador não fornecer postId persistido sem escrita.",
        ],
    },
}

PIPELINE_STAGE_NODE_ENTRYPOINTS: dict[str, tuple[str, ...]] = {
    "curator": ("scripts/pipeline-kino.js", "scripts/cadu-curador-v4.4.js"),
    "ig": ("scripts/scan-ig-browser.js",),
    "duplicates": ("scripts/pipeline-kino.js", "scripts/enrich-duplicates.js"),
    "format": ("scripts/pipeline-kino.js", "scripts/formatador-ia.js"),
    "publish": ("scripts/pipeline-kino.js", "scripts/publish_auto_v5.js"),
    "enrich": ("scripts/enrich-images.js",),
    "dedup": ("scripts/dedup-kino.js",),
    # Fix N (2026-07-24): entrypoint do stage enrich-instagram (chamado individualmente
    # via --stage=enrich-instagram ou via --stage=all). Sem esta entrada, o pre-flight
    # falha com selected_stage_missing_evidence e a run termina como failed mesmo
    # com todos os outros stages tendo sucesso. Scripts ja existem desde Fix A/B
    # mas o entrypoint individual nunca foi registrado.
    "enrich-instagram": (
        "scripts/pipeline-kino.js",
        "scripts/cache-instagram-images.js",
        "scripts/enrich-instagram-with-official-source.js",
    ),
    "all": (
        "scripts/pipeline-kino.js",
        "scripts/cadu-curador-v4.4.js",
        "scripts/scan-ig-browser.js",
        "scripts/enrich-duplicates.js",
        # Fix A + Fix B (2026-07-23): deps do stage enrich-instagram
        "scripts/cache-instagram-images.js",
        "scripts/enrich-instagram-with-official-source.js",
        "scripts/formatador-ia.js",
        "scripts/publish_auto_v5.js",
        "scripts/enrich-images.js",
    ),
}

REQUIREMENT_LABELS = {
    "supabase_key": "Chave Supabase/KinoCampus",
    "kino_credentials": "Login técnico KinoCampus",
    "deepseek_key": "Chave DeepSeek",
    "browser_cdp": "Navegador CDP do OpenClaw",
    "google_calendar": "OAuth do Google Agenda",
    "sigaa_credentials": "Credenciais SIGAA",
    "capsolver_key": "Chave da API CapSolver",
}

REQUIREMENT_ENV_ALIASES = {
    "supabase_key": (
        "CADU_SUPABASE_ANON_KEY",
        "SUPABASE_ANON_KEY",
        "KINOCAMPUS_SUPABASE_ANON_KEY",
    ),
    "kino_credentials": ("CADU_KINO_EMAIL", "CADU_EMAIL", "CADU_KINO_PASSWORD", "CADU_PASSWORD"),
    "deepseek_key": ("CADU_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"),
    "browser_cdp": ("OPENCLAW_CDP_HOST", "CDP_HOST", "BROWSER_CDP_HOST"),
    "google_calendar": (
        "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET",
        "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN",
        "GOOGLE_OAUTH_TOKEN_FILE",
    ),
    "sigaa_credentials": ("UFG_LOGIN", "UFG_PASSWORD", "SIGAA_LOGIN", "SIGAA_PASSWORD"),
    "capsolver_key": ("CAPSOLVER_API_KEY",),
}

_BROWSER_CDP_RECOVERY_LOCK = threading.Lock()

PIPELINE_ENV_FILES = (
    PIPELINE_WORKSPACE_PATH / ".env",
    PIPELINE_WORKSPACE_PATH / ".env.local",
    PIPELINE_WORKSPACE_PATH / "kino-campus" / ".env.local",
    PIPELINE_WORKSPACE_PATH / "kino-campus" / "services" / "cadu-ufg-publisher" / ".env.local",
    PIPELINE_WORKSPACE_PATH / "scripts" / "sigaa" / ".env",
)

SUMMARY_KEYS = {
    "sites escaneados": ("sites_scanned", "Sites escaneados"),
    "sites": ("sites_scanned", "Sites escaneados"),
    "total itens": ("total_items", "Total itens"),
    "publicaveis": ("truly_new", "Publicáveis"),
    "publish": ("curator_candidates", "Candidatos do curador"),
    "revisao": ("review", "Revisão"),
    "review": ("review", "Revisão"),
    "descartados": ("discarded", "Descartados"),
    "descart": ("discarded", "Descartados"),
    "publicados": ("published", "Publicados"),
    "fontes configuradas": ("configured_sources", "Fontes configuradas"),
    "coletas tentadas": ("collection_attempted", "Coletas tentadas"),
    "candidatos do curador": ("curator_candidates", "Candidatos do curador"),
    "ja persistidos": ("already_persisted", "Já persistidos"),
    "novos na pipeline": ("truly_new", "Novos na pipeline"),
    "revisao de qualidade": ("quality_review", "Revisão de qualidade"),
    "avaliados pelo publisher": ("publish_evaluated", "Avaliados pelo publisher"),
    "criados": ("created", "Criados"),
    "mesclados": ("merged", "Mesclados"),
    "persistidos": ("persisted", "Persistidos"),
    "duplicatas processadas": ("duplicates_processed", "Duplicatas processadas"),
    "updates processados": ("updates_processed", "Atualizações processadas"),
    "match encontrado": ("matches_found", "Correspondências encontradas"),
    "covers trocadas": ("covers_changed", "Capas trocadas"),
    "atualizados": ("updated", "Atualizados"),
    "nao atualizados": ("not_updated", "Não atualizados"),
    "posts processados": ("posts_processed", "Posts processados"),
    "posts com novas imagens": ("posts_with_new_images", "Posts com novas imagens"),
    "total imagens adicionadas": ("images_added", "Total imagens adicionadas"),
    "erros": ("errors", "Erros"),
}

STEP_MARKER = "__CADU_STEP_JSON__"
OUTCOME_MARKER = "__CADU_PIPELINE_OUTCOME__"
FUNNEL_MARKER = "__CADU_PIPELINE_FUNNEL__"
FUNNEL_RUN_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
VALID_OUTCOME_STATUSES = {"success", "partial", "failed"}
ACTIVE_RUN_STATUSES = {"pending", "running", "stopping"}
NON_SUCCESS_TERMINAL_RUN_STATUSES = {"failed", "cancelled", "stopped", "timed_out"}


# ---------- SQLite ----------

def _init_db() -> None:
    PIPELINE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    PIPELINE_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    # Compartilhado entre cadu-api(root no container) e OpenClaw(ubuntu).
    # Sticky bit permite PID/exit por run sem permitir substituir o lock root.
    PIPELINE_RUNTIME_DIR.chmod(0o1777)
    runtime_lock_path = PIPELINE_RUNTIME_DIR / "runtime.lock"
    lock_flags = os.O_CREAT | os.O_APPEND | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
    lock_fd = os.open(runtime_lock_path, lock_flags, 0o666)
    try:
        if not stat.S_ISREG(os.fstat(lock_fd).st_mode):
            raise RuntimeError(f"o bloqueio operacional não é um arquivo regular: {runtime_lock_path}")
        if hasattr(os, "fchmod"):
            os.fchmod(lock_fd, 0o666)
        else:
            runtime_lock_path.chmod(0o666)
    finally:
        os.close(lock_fd)
    conn = sqlite3.connect(str(PIPELINE_DB_PATH))
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                stage TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                finished_at INTEGER,
                exit_code INTEGER,
                log_path TEXT NOT NULL,
                pid INTEGER,
                submitted_by TEXT,
                message TEXT,
                dry_run INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
            CREATE INDEX IF NOT EXISTS idx_runs_stage_status ON runs(stage, status);
        """)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(runs)").fetchall()}
        if "dry_run" not in columns:
            conn.execute("ALTER TABLE runs ADD COLUMN dry_run INTEGER NOT NULL DEFAULT 0")
        # O comando historicamente catalogado para dedup nunca incluiu --apply,
        # portanto runs antigas desse stage sempre foram efetivamente dry-run.
        conn.execute("UPDATE runs SET dry_run = 1 WHERE stage = 'dedup'")
        conn.commit()
    finally:
        conn.close()


_init_db()


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(PIPELINE_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _readiness_timeout(deadline: float, maximum: float) -> float:
    """Return a subprobe timeout without extending the shared deadline."""

    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("prazo da verificação de prontidão da pipeline esgotado")
    return min(maximum, remaining)


def _artifact_paths_receipt(lines: list[str]) -> Optional[list[str]]:
    """Return validated effective container paths emitted by the Node probe."""

    for line in lines:
        if not line.startswith(PIPELINE_ARTIFACT_PATHS_MARKER):
            continue
        try:
            payload = json.loads(line[len(PIPELINE_ARTIFACT_PATHS_MARKER):])
        except (TypeError, ValueError, json.JSONDecodeError):
            return None
        if (
            not isinstance(payload, dict)
            or set(payload) != {"schemaVersion", "paths"}
            or payload.get("schemaVersion") != 1
        ):
            return None
        paths = payload.get("paths")
        if (
            not isinstance(paths, list)
            or len(paths) != 5
            or any(
                not isinstance(value, str)
                or not value
                or len(value) > 4096
                or "\x00" in value
                or not PurePosixPath(value).is_absolute()
                for value in paths
            )
        ):
            return None
        return paths
    return None


def get_pipeline_readiness() -> dict:
    """Probe barato das dependencias minimas para aceitar comandos.

    Este caminho e deliberadamente independente de historico, summaries e
    arquivos de log. Ele valida apenas o banco operacional, os executaveis
    unicos referenciados diretamente pelo catalogo e o container OpenClaw que
    recebera ``docker exec``. Qualquer erro e tratado como not-ready.
    """
    deadline = time.monotonic() + PIPELINE_READINESS_TOTAL_TIMEOUT_SEC
    checks: dict[str, dict] = {}

    database_ready = False
    conn: Optional[sqlite3.Connection] = None
    try:
        conn = _db()
        database_timeout = _readiness_timeout(
            deadline,
            _PIPELINE_READINESS_DB_TIMEOUT_SEC,
        )
        conn.execute(f"PRAGMA busy_timeout = {max(1, int(database_timeout * 1000))}")
        # BEGIN IMMEDIATE proves the same write reservation needed by POST
        # /run can be acquired, while LIMIT 0 validates the persisted schema
        # without reading history. Always roll back: readiness never mutates.
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("SELECT id, status, dry_run FROM runs LIMIT 0")
        conn.rollback()
        database_ready = True
    except Exception:
        database_ready = False
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                database_ready = False
    checks["database"] = {
        "ready": database_ready,
        "detail": (
            "transação de escrita e esquema de execuções disponíveis"
            if database_ready
            else "banco da pipeline indisponível ou com esquema inválido"
        ),
    }

    required_scripts = {stage.script for stage in PIPELINE_STAGES.values()}
    for entrypoints in PIPELINE_STAGE_NODE_ENTRYPOINTS.values():
        required_scripts.update(entrypoints)
    required_scripts.update({
        PIPELINE_ARTIFACT_DIRECTORY_PROBE_RELATIVE,
        PIPELINE_SAFE_DIRECTORY_RELATIVE,
    })
    unique_scripts = sorted(required_scripts)
    missing_scripts: list[str] = []
    try:
        workspace_root = PIPELINE_WORKSPACE_PATH.resolve()
    except OSError:
        missing_scripts = list(unique_scripts)
    else:
        for relative_path in unique_scripts:
            try:
                candidate = (PIPELINE_WORKSPACE_PATH / relative_path).resolve()
                candidate.relative_to(workspace_root)
                if not candidate.is_file():
                    missing_scripts.append(relative_path)
            except (OSError, ValueError):
                missing_scripts.append(relative_path)
    scripts_ready = not missing_scripts
    checks["catalog_scripts"] = {
        "ready": scripts_ready,
        "checked": len(unique_scripts),
        "missing": missing_scripts,
    }

    openclaw_ready = False
    docker_detail = "docker inspect indisponível"
    try:
        inspected = subprocess.run(
            [
                "docker",
                "inspect",
                "--format",
                "{{.State.Running}}",
                OPENCLAW_CONTAINER,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=_readiness_timeout(
                deadline,
                _PIPELINE_READINESS_INSPECT_TIMEOUT_SEC,
            ),
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        openclaw_ready = inspected.returncode == 0 and inspected.stdout.strip() == "true"
        docker_detail = "em execução" if openclaw_ready else "fora de execução"
    except Exception:
        openclaw_ready = False
    checks["openclaw_container"] = {
        "ready": openclaw_ready,
        "container": OPENCLAW_CONTAINER,
        "detail": docker_detail,
    }

    # Merely seeing a running container is insufficient now that every stage
    # deliberately executes as the unprivileged ``node`` user.  Prove the same
    # user/commands/mount permissions needed by build_stage_docker_command,
    # without creating files or acquiring the runtime lock (git-sync owns that
    # lock while it calls this readiness endpoint during deployment).
    execution_ready = False
    artifact_directories_ready = False
    artifact_directory_defaults = [
        *PIPELINE_ARTIFACT_DIRS_CONTAINER,
        *PIPELINE_OPTIONAL_ARTIFACT_DIRS_CONTAINER,
    ]
    effective_artifact_directories = artifact_directory_defaults
    artifact_paths_effective = False
    execution_detail = "a verificação de execução sem privilégios não foi realizada"
    artifact_directories_detail = "a verificação dos diretórios de artefatos não foi realizada"
    if openclaw_ready:
        probe_script = (
            "set -eu; "
            "workspace=\"$1\"; runtime=\"$2\"; "
            "data_root=\"$3\"; default_scrape=\"$4\"; default_instagram=\"$5\"; "
            "default_dedup=\"$6\"; default_sigaa=\"$7\"; "
            "artifact_probe=\"$8\"; shift 8; "
            "test \"$(id -u)\" -ne 0; "
            "command -v node >/dev/null; "
            "command -v flock >/dev/null; "
            "command -v setsid >/dev/null; "
            "test -d \"$workspace\"; test -r \"$workspace\"; test -x \"$workspace\"; "
            "test -d \"$runtime\"; test -w \"$runtime\"; "
            "test -f \"$runtime/runtime.lock\"; "
            "test -w \"$runtime/runtime.lock\"; "
            "for relative_path in \"$@\"; do "
            "test -r \"$workspace/$relative_path\"; "
            "done; "
            "printf 'execution-ready\\n'; "
            "node \"$workspace/$artifact_probe\" "
            "\"$workspace\" \"$data_root\" \"$default_scrape\" "
            "\"$default_instagram\" \"$default_dedup\" \"$default_sigaa\""
        )
        try:
            executed = subprocess.run(
                [
                    "docker",
                    "exec",
                    "--user",
                    OPENCLAW_RUNTIME_USER,
                    OPENCLAW_CONTAINER,
                    "bash",
                    "-c",
                    probe_script,
                    "cadu-readiness",
                    OPENCLAW_WORKSPACE_CONTAINER,
                    PIPELINE_RUNTIME_DIR_CONTAINER,
                    *PIPELINE_ARTIFACT_DIRS_CONTAINER,
                    *PIPELINE_OPTIONAL_ARTIFACT_DIRS_CONTAINER,
                    PIPELINE_ARTIFACT_DIRECTORY_PROBE_RELATIVE,
                    *unique_scripts,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=_readiness_timeout(
                    deadline,
                    _PIPELINE_READINESS_EXEC_TIMEOUT_SEC,
                ),
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            probe_lines = executed.stdout.splitlines()
            probe_markers = set(probe_lines)
            effective_receipt = _artifact_paths_receipt(probe_lines)
            if effective_receipt is not None:
                effective_artifact_directories = effective_receipt
                artifact_paths_effective = True
            execution_ready = "execution-ready" in probe_markers
            artifact_directories_ready = (
                executed.returncode == 0
                and artifact_paths_effective
                and "artifact-directories-ready" in probe_markers
            )
            execution_detail = (
                "execução Node.js, leitura do ambiente de trabalho e escrita operacional disponíveis"
                if execution_ready
                else "a verificação de execução sem privilégios falhou"
            )
            artifact_directories_detail = (
                "raiz de dados e pastas ativas do Curador, Instagram, deduplicação e SIGAA acessíveis"
                if artifact_directories_ready
                else "pastas de artefatos ausentes, inseguras ou sem permissão de escrita e travessia"
            )
        except Exception:
            execution_ready = False
            artifact_directories_ready = False
            execution_detail = "verificação de execução sem privilégios indisponível"
            artifact_directories_detail = "verificação dos diretórios de artefatos indisponível"
    checks["openclaw_execution"] = {
        "ready": execution_ready,
        "user": OPENCLAW_RUNTIME_USER,
        "account": "node",
        "detail": execution_detail,
    }
    checks["artifact_directories"] = {
        "ready": artifact_directories_ready,
        "paths": effective_artifact_directories,
        "paths_effective": artifact_paths_effective,
        "user": OPENCLAW_RUNTIME_USER,
        "detail": artifact_directories_detail,
    }

    ready = (
        database_ready
        and scripts_ready
        and openclaw_ready
        and execution_ready
        and artifact_directories_ready
    )
    return {
        "ready": ready,
        "checked_at": int(time.time()),
        "checks": checks,
    }


# ---------- Preflight + summaries ----------

def _strip_accents(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", value or "")
        if not unicodedata.combining(ch)
    )


def _normalize_key(value: str) -> str:
    value = _strip_accents(value).lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" :\t\r\n")


def _coerce_metric(value: str):
    match = re.search(r"-?\d+(?:[.,]\d+)?", value or "")
    if not match:
        return value.strip()
    raw = match.group(0).replace(",", ".")
    number = float(raw)
    return int(number) if number.is_integer() else number


def _marker_payload(line: str, prefix: str) -> Optional[dict]:
    stripped = (line or "").strip()
    if not stripped.startswith(prefix):
        return None
    raw = stripped[len(prefix):].strip()
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _normalize_step_marker(payload: dict, source: str = "marker") -> Optional[dict]:
    step_id = str(payload.get("id") or "").strip()
    if not step_id:
        return None
    status = str(payload.get("status") or "").strip().lower()
    if status not in {"success", "failed", "blocked", "skipped"}:
        status = "failed" if payload.get("exit_code") not in (None, 0) or payload.get("signal") else "success"
    exit_code = payload.get("exit_code")
    if not isinstance(exit_code, int):
        exit_code = None
    signal = payload.get("signal")
    if not isinstance(signal, str) or not signal.strip():
        signal = None
    return {
        "id": step_id[:80],
        "label": str(payload.get("label") or step_id)[:200],
        "required": payload.get("required") is True,
        "status": status,
        "ok": status in {"success", "skipped"} and exit_code in (None, 0) and signal is None,
        "exit_code": exit_code,
        "signal": signal,
        "duration_ms": payload.get("duration_ms") if isinstance(payload.get("duration_ms"), int) else None,
        "stdout_truncated": payload.get("stdout_truncated") is True,
        "stderr_truncated": payload.get("stderr_truncated") is True,
        "source": source,
        **({"reason": str(payload.get("reason"))[:120]} if payload.get("reason") else {}),
    }


def _infer_legacy_step(label: str, exit_code: int) -> dict:
    normalized = _normalize_key(label)
    step_id = "step"
    required = False
    policies = (
        (("curador", "curator"), "curator", True),
        (("formatador", "formatacao"), "format", True),
        (("publicacao", "publish"), "publish", True),
        (("instagram",), "ig", False),
        (("duplicata",), "duplicates", False),
        (("eventlink", "event link"), "event_link", False),
        (("enriquecimento de imagens",), "enrich", False),
        (("dedup",), "dedup", False),
    )
    for aliases, candidate_id, candidate_required in policies:
        if any(alias in normalized for alias in aliases):
            step_id = candidate_id
            required = candidate_required
            break
    return {
        "id": step_id,
        "label": label.strip()[:200],
        "required": required,
        "status": "success" if exit_code == 0 else "failed",
        "ok": exit_code == 0,
        "exit_code": exit_code,
        "signal": None,
        "duration_ms": None,
        "source": "legacy_log",
    }


def _derive_outcome_from_steps(steps: list[dict], source: str = "derived") -> Optional[dict]:
    if not steps:
        return None
    failed = [step for step in steps if not step.get("ok")]
    required_failures = sorted({step.get("id") for step in failed if step.get("required")})
    optional_failures = sorted({step.get("id") for step in failed if not step.get("required")})
    status = "failed" if required_failures else ("partial" if optional_failures else "success")
    return {
        "schema_version": 1,
        "status": status,
        "required_failures": required_failures,
        "optional_failures": optional_failures,
        "step_count": len(steps),
        "source": source,
    }


def _normalize_outcome_marker(payload: dict, steps: list[dict]) -> Optional[dict]:
    status = str(payload.get("status") or "").strip().lower()
    if status not in VALID_OUTCOME_STATUSES:
        return _derive_outcome_from_steps(steps, source="derived_invalid_marker")
    derived = _derive_outcome_from_steps(steps, source="marker") or {}
    severity = {"success": 0, "partial": 1, "failed": 2}
    derived_status = derived.get("status")
    source = "marker"
    if derived_status in VALID_OUTCOME_STATUSES and severity[derived_status] > severity[status]:
        # O detalhe por step e evidencia mais forte que um aggregate inconsistente.
        status = derived_status
        source = "marker_reconciled_with_steps"
    def failure_ids(value, fallback):
        if not isinstance(value, list):
            value = fallback
        result = []
        for item in value or []:
            normalized = str(item or "").strip()[:80]
            if normalized and normalized not in result:
                result.append(normalized)
        return result

    return {
        "schema_version": payload.get("schema_version") if isinstance(payload.get("schema_version"), int) else 1,
        "status": status,
        "required_failures": failure_ids(payload.get("required_failures"), derived.get("required_failures")),
        "optional_failures": failure_ids(payload.get("optional_failures"), derived.get("optional_failures")),
        "step_count": payload.get("step_count")
        if isinstance(payload.get("step_count"), int) and payload.get("step_count") >= 0
        else len(steps),
        "source": source,
    }


FUNNEL_COUNT_FIELDS = {
    "configuredSources": "configured_sources",
    "collectionAttempted": "collection_attempted",
    "collectedItems": "collected_items",
    "curatorCandidates": "curator_candidates",
    "curatorReview": "curator_review",
    "curatorDiscarded": "curator_discarded",
    "alreadyPersisted": "already_persisted",
    "trulyNew": "truly_new",
    "qualityReview": "quality_review",
    "publishEvaluated": "publish_evaluated",
    "created": "created",
    "merged": "merged",
    "pending": "pending",
    "persisted": "persisted",
}
FUNNEL_OPTIONAL_COUNT_FIELDS = {
    "instagramProfilesExpected": "instagram_profiles_expected",
    "instagramProfilesSuccessful": "instagram_profiles_successful",
    "instagramProfilesFailed": "instagram_profiles_failed",
    "instagramPostOccurrences": "instagram_post_occurrences",
    "instagramUniquePosts": "instagram_unique_posts",
    "instagramDuplicatePostOccurrences": "instagram_duplicate_post_occurrences",
    "instagramRelevantOccurrences": "instagram_relevant_occurrences",
    "instagramUniqueRelevant": "instagram_unique_relevant",
    "instagramDetailEligible": "instagram_detail_eligible",
    "instagramDetailRequested": "instagram_detail_requested",
    "instagramDetailReady": "instagram_detail_ready",
    "instagramDetailSucceeded": "instagram_detail_succeeded",
    "instagramDetailCompletedFromCache": "instagram_detail_completed_from_cache",
    "instagramDetailPartial": "instagram_detail_partial",
    "instagramDetailFailed": "instagram_detail_failed",
    "instagramDetailDeferred": "instagram_detail_deferred",
    "instagramDetailDeferredByBackoff": "instagram_detail_deferred_by_backoff",
}
FUNNEL_LABELS = {
    "configured_sources": "Fontes configuradas",
    "collection_attempted": "Coletas tentadas",
    "collected_items": "Itens coletados",
    "curator_candidates": "Candidatos do curador",
    "curator_review": "Revisão do curador",
    "curator_discarded": "Descartados pelo curador",
    "already_persisted": "Já persistidos",
    "truly_new": "Novos na pipeline",
    "quality_review": "Revisão de qualidade",
    "publish_evaluated": "Avaliados pelo publisher",
    "created": "Criados",
    "merged": "Mesclados",
    "pending": "Pendentes",
    "persisted": "Persistidos",
    "instagram_profiles_expected": "IG perfis esperados",
    "instagram_profiles_successful": "IG perfis coletados",
    "instagram_profiles_failed": "IG perfis com falha",
    "instagram_post_occurrences": "IG ocorrências de posts",
    "instagram_unique_posts": "IG posts únicos",
    "instagram_duplicate_post_occurrences": "IG ocorrências duplicadas",
    "instagram_relevant_occurrences": "IG ocorrências relevantes",
    "instagram_unique_relevant": "IG relevantes únicos",
    "instagram_detail_eligible": "IG detalhes elegíveis",
    "instagram_detail_requested": "IG detalhes solicitados",
    "instagram_detail_ready": "IG detalhes prontos",
    "instagram_detail_succeeded": "IG detalhes hidratados ao vivo",
    "instagram_detail_completed_from_cache": "IG detalhes do cache",
    "instagram_detail_partial": "IG detalhes parciais",
    "instagram_detail_failed": "IG detalhes com falha",
    "instagram_detail_deferred": "IG detalhes adiados",
    "instagram_detail_deferred_by_backoff": "IG detalhes em backoff",
}


def _normalize_funnel_marker(payload: dict) -> Optional[dict]:
    schema_version = payload.get("schemaVersion")
    if (
        isinstance(schema_version, bool)
        or not isinstance(schema_version, int)
        or schema_version != 1
        or not isinstance(payload.get("dryRun"), bool)
    ):
        return None
    if any(source_key not in payload for source_key in FUNNEL_COUNT_FIELDS):
        return None
    normalized = {
        "schema_version": 1,
        "dry_run": payload["dryRun"],
    }
    run_id = payload.get("runId")
    if run_id is not None:
        if not isinstance(run_id, str) or not FUNNEL_RUN_ID_RE.fullmatch(run_id):
            return None
        normalized["run_id"] = run_id
    for source_key, target_key in FUNNEL_COUNT_FIELDS.items():
        value = payload.get(source_key)
        if value is not None and (
            isinstance(value, bool) or not isinstance(value, int) or value < 0
        ):
            return None
        normalized[target_key] = value
    for source_key, target_key in FUNNEL_OPTIONAL_COUNT_FIELDS.items():
        value = payload.get(source_key)
        if value is not None and (
            isinstance(value, bool) or not isinstance(value, int) or value < 0
        ):
            return None
        normalized[target_key] = value
    persisted = normalized["persisted"]
    persistence_parts = [normalized[key] for key in ("created", "merged", "pending")]
    if persisted is not None and all(value is not None for value in persistence_parts):
        if persisted != sum(persistence_parts):
            return None
    return normalized


def _env_keys_from_files() -> set[str]:
    """Return only dotenv keys whose assigned value is materially non-empty."""

    keys: set[str] = set()
    assignment_re = re.compile(
        r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$",
    )
    unresolved_reference_re = re.compile(r"^\$\{[A-Za-z_][A-Za-z0-9_]*(?::?-[^}]*)?\}$")
    for env_file in PIPELINE_ENV_FILES:
        try:
            if not env_file.exists() or not env_file.is_file():
                continue
            for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
                match = assignment_re.match(line)
                if not match:
                    continue
                raw_value = match.group(2).strip()
                if raw_value in {"", "''", '\"\"'} or raw_value.startswith("#"):
                    continue
                # A bare ${NAME} placeholder is not proof that the referenced
                # runtime secret exists. Real quoted/unquoted values remain
                # opaque: only their non-emptiness is retained.
                if unresolved_reference_re.fullmatch(raw_value):
                    continue
                keys.add(match.group(1))
        except Exception:
            continue
    return keys


def _env_requirement_present(requirement: str) -> bool:
    file_keys = _env_keys_from_files()
    present = lambda names: any(bool((os.getenv(name) or "").strip()) for name in names) or any(
        name in file_keys for name in names
    )
    if requirement == "kino_credentials":
        email_names = ("CADU_KINO_EMAIL", "CADU_EMAIL")
        password_names = ("CADU_KINO_PASSWORD", "CADU_PASSWORD")
        return present(email_names) and present(password_names)
    if requirement == "google_calendar":
        client_ready = present(("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"))
        secret_ready = present(("GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"))
        token_file = os.getenv(
            "GOOGLE_OAUTH_TOKEN_FILE",
            "/data/.config/gogcli/tokens/yan-manual--yan1nakamura@gmail.com.json",
        )
        refresh_ready = present((
            "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN",
            "GOOGLE_OAUTH_TOKEN_FILE",
        )) or Path(token_file).is_file()
        return client_ready and secret_ready and refresh_ready
    if requirement == "sigaa_credentials":
        return present(("UFG_LOGIN", "SIGAA_LOGIN")) and present(
            ("UFG_PASSWORD", "SIGAA_PASSWORD"),
        )
    aliases = REQUIREMENT_ENV_ALIASES.get(requirement, ())
    if not aliases:
        return False
    return present(aliases)


def _stage_script_info(stage: PipelineStage) -> dict:
    script_path = (PIPELINE_WORKSPACE_PATH / stage.script).resolve()
    workspace_root = PIPELINE_WORKSPACE_PATH.resolve()
    inside_workspace = False
    try:
        script_path.relative_to(workspace_root)
        inside_workspace = True
    except ValueError:
        inside_workspace = False

    exists = inside_workspace and script_path.exists() and script_path.is_file()
    return {
        "path": str(script_path),
        "relative_path": stage.script,
        "exists": bool(exists),
        "inside_workspace": inside_workspace,
        "size_bytes": script_path.stat().st_size if exists else None,
        "modified_at": int(script_path.stat().st_mtime) if exists else None,
    }


def _run_deep_check(args: list[str], timeout_sec: int = 5) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            [
                "docker", "exec", "--user", OPENCLAW_RUNTIME_USER,
                OPENCLAW_CONTAINER, *args,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        output = (proc.stdout or proc.stderr or "").strip()
        return proc.returncode == 0, output[:240]
    except Exception as e:
        return False, str(e)[:240]


def _deep_requirement_check(requirement: str) -> Optional[dict]:
    if requirement == "browser_cdp":
        script = r"""
const http = require('node:http');
const fail = code => process.exit(code);
const request = http.get('http://127.0.0.1:18800/json/version', response => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', chunk => {
    body += chunk;
    if (body.length > 65536) request.destroy(new Error('oversized CDP response'));
  });
  response.on('end', () => {
    if (response.statusCode !== 200) return fail(2);
    try {
      const value = JSON.parse(body);
      if (typeof value.Browser !== 'string'
          || typeof value.webSocketDebuggerUrl !== 'string'
          || !value.webSocketDebuggerUrl.startsWith('ws://')) return fail(5);
      process.exit(0);
    } catch (_) {
      fail(6);
    }
  });
  response.on('error', () => fail(7));
});
request.on('error', () => fail(3));
request.setTimeout(3000, () => request.destroy(new Error('CDP timeout')));
""".strip()
        ok, detail = _run_deep_check(["node", "-e", script], timeout_sec=5)
        return {
            "id": requirement,
            "label": REQUIREMENT_LABELS.get(requirement, requirement),
            "status": "ok" if ok else "missing",
            "blocking": True,
            "detail": detail or ("CDP respondeu" if ok else "CDP não respondeu"),
        }
    if requirement == "google_calendar":
        safe_directory_module = json.dumps(str(
            PurePosixPath(OPENCLAW_WORKSPACE_CONTAINER)
            / PIPELINE_SAFE_DIRECTORY_RELATIVE
        ))
        script = (
            "const { assertRealDirectory } = require("
            + safe_directory_module
            + ");\n"
            + r"""
const fs = require('fs');
const path = require('path');
const first = names => names.map(name => String(process.env[name] || '').trim()).find(Boolean) || '';
const client = first(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_CLIENT_ID']);
const secret = first(['GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET']);
let refresh = first(['GOOGLE_OAUTH_REFRESH_TOKEN', 'GOOGLE_REFRESH_TOKEN']);
if (!refresh) {
  const file = first(['GOOGLE_OAUTH_TOKEN_FILE'])
    || '/data/.config/gogcli/tokens/yan-manual--yan1nakamura@gmail.com.json';
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) process.exit(3);
    fs.accessSync(file, fs.constants.R_OK);
    const parent = path.dirname(path.resolve(file));
    try {
      assertRealDirectory(parent);
      if ((fs.lstatSync(parent).mode & 0o1000) !== 0) process.exit(5);
    } catch (_) { process.exit(5); }
    fs.accessSync(parent, fs.constants.W_OK | fs.constants.X_OK);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    refresh = typeof parsed.refresh_token === 'string' ? parsed.refresh_token.trim() : '';
  } catch (_) { process.exit(4); }
}
if (!client || !secret || !refresh) process.exit(2);
console.log('credenciais OAuth e refresh token disponíveis');
"""
        )
        ok, detail = _run_deep_check(["node", "-e", script], timeout_sec=5)
        return {
            "id": requirement,
            "label": REQUIREMENT_LABELS.get(requirement, requirement),
            "status": "ok" if ok else "missing",
            "blocking": True,
            "detail": detail or (
                "OAuth do Google Agenda disponível"
                if ok else "OAuth/refresh token do Google Agenda indisponível"
            ),
        }
    return None


def _preflight_is_browser_cdp_only_blocker(preflight: dict) -> bool:
    blockers = [
        check
        for check in (preflight.get("blockers") or [])
        if isinstance(check, dict) and check.get("status") != "ok"
    ]
    return bool(blockers) and all(check.get("id") == "browser_cdp" for check in blockers)


def _acquire_maintenance_lock(path: Path) -> Optional[int]:
    """Acquire one root-owned host maintenance lock without following links."""
    if fcntl is None:
        return None
    try:
        parent = path.parent.lstat()
        if (
            not stat.S_ISDIR(parent.st_mode)
            or parent.st_uid != 0
            or parent.st_gid != 0
            or stat.S_IMODE(parent.st_mode) != 0o700
        ):
            return None
        flags = os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != 0
            or info.st_gid != 0
            or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600
        ):
            os.close(descriptor)
            return None
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(descriptor)
            return None
        return descriptor
    except OSError:
        return None


def _acquire_cdp_maintenance_locks() -> Optional[tuple[int, int]]:
    """Serialize with the host CDP watchdog and transactional deployer."""
    cdp_descriptor = _acquire_maintenance_lock(PIPELINE_CDP_MAINTENANCE_LOCK)
    if cdp_descriptor is None:
        return None
    deploy_descriptor = _acquire_maintenance_lock(PIPELINE_DEPLOY_LOCK)
    if deploy_descriptor is None:
        os.close(cdp_descriptor)
        return None
    return cdp_descriptor, deploy_descriptor


def _release_maintenance_locks(descriptors: Optional[tuple[int, int]]) -> None:
    for descriptor in reversed(descriptors or ()):
        try:
            os.close(descriptor)
        except OSError:
            pass


def _recover_browser_cdp() -> bool:
    """Start the local OpenClaw browser once at action time, then re-probe.

    Read-only readiness endpoints remain read-only. Recovery is called only by
    ``create_run`` after its deep preflight proves that CDP is the blocker.
    The process-local lock serializes API callers. Root-owned host locks also
    serialize the start with the CDP watchdog and transactional deployer.
    """
    with _BROWSER_CDP_RECOVERY_LOCK:
        current = _deep_requirement_check("browser_cdp") or {}
        if current.get("status") == "ok":
            return True

        maintenance_locks = _acquire_cdp_maintenance_locks()
        if maintenance_locks is None:
            return False

        try:
            # The watchdog may have recovered CDP before this request acquired
            # the shared locks. Re-probe before issuing the idempotent start.
            current = _deep_requirement_check("browser_cdp") or {}
            if current.get("status") == "ok":
                return True

            print(
                "[cadu-api] browser CDP unavailable at action time; starting local browser",
                flush=True,
            )
            started, _ = _run_deep_check(
                ["openclaw", "browser", "start"],
                timeout_sec=45,
            )
            if not started:
                return False

            # Match the host watchdog's cold-start allowance: eight probes,
            # two seconds apart, against the real /json/version contract.
            for _ in range(8):
                time.sleep(2)
                current = _deep_requirement_check("browser_cdp") or {}
                if current.get("status") == "ok":
                    return True
            return False
        finally:
            _release_maintenance_locks(maintenance_locks)


def _stage_node_dependency_check(stage_id: str, stage: PipelineStage) -> dict:
    entrypoints = PIPELINE_STAGE_NODE_ENTRYPOINTS.get(stage_id, (stage.script,))
    script = r"""
const fs = require('fs');
const path = require('path');
const Module = require('module');
const workspace = '/data/.openclaw/workspace';
// 2026-07-24 (Fix I): cache-instagram-images.js (Fix A) resolve playwright em
// runtime via loadPlaywright() que adiciona /kino-campus/node_modules ao
// NODE_PATH. Sem listar esse path aqui, o pre-flight marca playwright como
// dep ausente e o stage 'all' falha com HTTP 400 mesmo quando o runtime tem
// playwright disponivel.
const extraResolvePaths = ['/data/.openclaw/workspace/kino-campus/node_modules'];
const files = JSON.parse(process.argv[1] || '[]');
const builtins = new Set(Module.builtinModules.concat(Module.builtinModules.map(m => 'node:' + m)));
const missing = [];
const checked = [];
for (const rel of files) {
  const file = path.join(workspace, rel);
  if (!fs.existsSync(file)) {
    missing.push(`${rel}:arquivo_ausente`);
    continue;
  }
  checked.push(rel);
  const src = fs.readFileSync(file, 'utf8');
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const dep = m[1];
    if (builtins.has(dep)) continue;
    try {
      if (dep.startsWith('.')) {
        require.resolve(path.resolve(path.dirname(file), dep));
      } else {
        require.resolve(dep, {
          paths: [path.dirname(file), workspace, ...extraResolvePaths],
        });
      }
    } catch (e) {
      missing.push(`${rel}:${dep}`);
    }
  }
}
if (missing.length) {
  console.error('dependências ausentes: ' + missing.slice(0, 12).join(', '));
  process.exit(2);
}
console.log('importações válidas: ' + checked.join(', '));
"""
    ok, detail = _run_deep_check(["node", "-e", script, json.dumps(entrypoints)], timeout_sec=10)
    return {
        "id": "node_dependencies",
        "label": "Dependências Node.js",
        "status": "ok" if ok else "missing",
        "blocking": True,
        "detail": detail or ("dependências resolvidas" if ok else "falha ao validar dependências"),
    }


def _today_tag() -> str:
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()


def _scrape_dir() -> Path:
    return PIPELINE_WORKSPACE_PATH / "data" / "ufg-scrape"


def _newest_file(patterns: tuple[str, ...]) -> Optional[Path]:
    scrape_dir = _scrape_dir()
    if not scrape_dir.exists():
        return None
    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(p for p in scrape_dir.glob(pattern) if p.is_file())
    if not matches:
        return None
    return max(matches, key=lambda p: p.stat().st_mtime)


def _artifact_check(check_id: str, label: str, path: Optional[Path], *, blocking: bool, missing_detail: str) -> dict:
    exists = bool(path and path.exists() and path.is_file())
    return {
        "id": check_id,
        "label": label,
        "status": "ok" if exists else "missing",
        "blocking": blocking,
        "detail": str(path.name) if exists and path else missing_detail,
    }


def _reject_duplicate_artifact_pairs(pairs):
    parsed = {}
    for key, value in pairs:
        if key in parsed:
            raise ValueError(f"chave JSON duplicada: {key}")
        parsed[key] = value
    return parsed


def _reject_non_finite_artifact_number(value):
    raise ValueError(f"número JSON não finito: {value}")


def _artifact_stat_key(info: os.stat_result) -> tuple[int, int, int, int]:
    return (
        int(info.st_dev),
        int(info.st_ino),
        int(info.st_size),
        int(info.st_mtime_ns),
    )


def _artifact_cache_key(info: os.stat_result) -> tuple[int, int, int, int, int]:
    # ctime strengthens cache invalidation, but on NTFS lstat/fstat can expose
    # slightly different ctime granularities for the same open file. It must
    # therefore not participate in the pre-open identity comparison.
    return (*_artifact_stat_key(info), int(info.st_ctime_ns))


@lru_cache(maxsize=32)
def _read_json_artifact_snapshot(
    path_value: str,
    device: int,
    inode: int,
    size: int,
    mtime_ns: int,
    ctime_ns: int,
) -> tuple[dict, float]:
    """Read and strictly parse an immutable artifact identity once.

    The cache key is the complete filesystem identity observed with lstat.
    Every cache miss is reopened with O_NOFOLLOW and verified before and after
    the bounded read, preventing symlink swaps, truncation and unbounded JSON
    parsing in the readiness polling path.
    """

    expected = (device, inode, size, mtime_ns)
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path_value, flags)
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or _artifact_stat_key(opened) != expected:
            raise ValueError("o artefato mudou antes da leitura")
        remaining = size
        chunks: list[bytes] = []
        while remaining:
            chunk = os.read(descriptor, min(remaining, 1024 * 1024))
            if not chunk:
                raise ValueError("o artefato foi truncado durante a leitura")
            chunks.append(chunk)
            remaining -= len(chunk)
        final = os.fstat(descriptor)
        if (
            _artifact_stat_key(final) != expected
            or final.st_ctime_ns != opened.st_ctime_ns
        ):
            raise ValueError("o artefato mudou durante a leitura")
    finally:
        os.close(descriptor)

    try:
        text = b"".join(chunks).decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("o artefato não é UTF-8 válido") from exc
    payload = json.loads(
        text,
        object_pairs_hook=_reject_duplicate_artifact_pairs,
        parse_constant=_reject_non_finite_artifact_number,
    )
    if not isinstance(payload, dict):
        raise ValueError("o artefato JSON não é um objeto")
    return payload, opened.st_mtime


def _read_json_artifact_bounded(path: Path) -> tuple[dict, float]:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("o artefato não é um arquivo regular")
    if info.st_size <= 0:
        raise ValueError("o artefato está vazio")
    if info.st_size > PIPELINE_ARTIFACT_MAX_BYTES:
        raise ValueError(
            f"o artefato excede {PIPELINE_ARTIFACT_MAX_BYTES // (1024 * 1024)} MiB"
        )
    return _read_json_artifact_snapshot(
        os.path.abspath(path),
        *_artifact_cache_key(info),
    )


def _json_content_sha256(payload: dict, *, contract_key: str) -> str:
    """Hash local para formas em que JSON stdlib e JSON.stringify coincidem."""
    material = copy.deepcopy(payload)
    if contract_key == "artifactContract":
        material.pop(contract_key, None)
    else:
        contract = material.get(contract_key)
        if not isinstance(contract, dict):
            raise ValueError(f"{contract_key} ausente")
        contract.pop("contentSha256", None)
    encoded = json.dumps(
        material,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _python_json_hash_is_node_stable(value: object) -> bool:
    """Return whether stdlib JSON is byte-identical to JSON.stringify here.

    Python and ECMAScript deliberately choose different decimal renderings for
    some finite numbers (for example ``1e-7``, ``1e-6`` and ``1e20``).  JS also
    reorders canonical array-index object keys.  The lightweight readiness
    path may still recompute hashes for the common string/integer-only shape,
    but ambiguous values are left for the authoritative Node validator used by
    every deep/action-time preflight.
    """

    if value is None or isinstance(value, (bool, str)):
        return True
    if isinstance(value, int):
        return -(2**53 - 1) <= value <= 2**53 - 1
    if isinstance(value, float):
        return False
    if isinstance(value, list):
        return all(_python_json_hash_is_node_stable(item) for item in value)
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                return False
            if re.fullmatch(r"(?:0|[1-9][0-9]{0,9})", key):
                try:
                    numeric_key = int(key)
                except ValueError:
                    return False
                if 0 <= numeric_key <= 2**32 - 2 and str(numeric_key) == key:
                    return False
            if not _python_json_hash_is_node_stable(item):
                return False
        return True
    return False


def _contract_timestamp(value: object, *, max_age_sec: int) -> float:
    if not isinstance(value, str) or not value:
        raise ValueError("generatedAt ausente")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("generatedAt inválido") from exc
    if parsed.tzinfo is None:
        raise ValueError("generatedAt sem timezone")
    generated_ts = parsed.astimezone(timezone.utc).timestamp()
    now = time.time()
    if generated_ts > now + 5 * 60:
        raise ValueError("generatedAt está no futuro")
    if now - generated_ts > max_age_sec:
        raise ValueError(f"generatedAt tem mais de {max_age_sec // 3600}h")
    return generated_ts


def _require_exact_object_keys(payload: dict, expected: set[str], label: str) -> None:
    actual = set(payload)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        detail = []
        if missing:
            detail.append("faltando=" + ",".join(missing))
        if extra:
            detail.append("extras=" + ",".join(extra))
        raise ValueError(f"campos de {label} incompatíveis ({'; '.join(detail)})")


def _require_uuid(value: object, label: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} ausente")
    try:
        parsed = uuid.UUID(value)
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError(f"{label} não é UUID") from exc
    if str(parsed) != value.lower():
        raise ValueError(f"{label} não é UUID canônico")
    return value


def _artifact_contract_check(
    check_id: str,
    label: str,
    path: Path,
    *,
    kind: str,
    max_age_sec: int = 25 * 3600,
) -> dict:
    if not path.exists() or not path.is_file():
        return {
            "id": check_id,
            "label": label,
            "status": "missing",
            "blocking": True,
            "detail": f"{path.name} ausente",
        }
    try:
        payload, artifact_mtime = _read_json_artifact_bounded(path)
        if artifact_mtime < time.time() - max_age_sec:
            raise ValueError(f"{path.name} tem mais de {max_age_sec // 3600}h")
        contract = payload.get("artifactContract")
        if not isinstance(contract, dict):
            raise ValueError("artifactContract ausente")
        expected_contract_keys = {
            "schemaVersion", "kind", "version", "mode", "runId",
            "dateBrt", "generatedAt", "contentSha256",
        }
        if kind == "truly-new":
            expected_contract_keys |= {"sourceArtifact", "sourceContentSha256"}
        _require_exact_object_keys(contract, expected_contract_keys, "artifactContract")
        if contract.get("schemaVersion") != 1 or contract.get("kind") != kind:
            raise ValueError("contrato ou versão incompatível")
        if contract.get("version") != CURATOR_VERSION:
            raise ValueError(f"versão do Curador diferente de {CURATOR_VERSION}")
        if contract.get("mode") not in {"daily", "full", "ig-only", "quick"}:
            raise ValueError("modo do Curador inválido")
        if contract.get("dateBrt") != _today_tag():
            raise ValueError("data BRT diferente de hoje")
        run_id = _require_uuid(contract.get("runId"), "runId")
        generated_ts = _contract_timestamp(
            contract.get("generatedAt"), max_age_sec=max_age_sec
        )
        expected_hash = str(contract.get("contentSha256") or "")
        if not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
            raise ValueError("hash SHA-256 ausente ou inválido")
        if _python_json_hash_is_node_stable(payload):
            actual_hash = _json_content_sha256(
                payload, contract_key="artifactContract",
            )
            if actual_hash != expected_hash:
                raise ValueError("hash SHA-256 não corresponde ao conteúdo")
        if kind == "truly-new" and not isinstance(payload.get("publishable"), list):
            raise ValueError("publishable não é uma lista")
        if kind == "truly-new":
            source_hash = str(contract.get("sourceContentSha256") or "")
            if not re.fullmatch(r"[0-9a-f]{64}", source_hash):
                raise ValueError("hash da origem ausente ou inválido")
            source_name = contract.get("sourceArtifact")
            if not isinstance(source_name, str) or not source_name:
                raise ValueError("artefato de origem ausente")
            source_match = _CURATOR_SOURCE_ARTIFACT_RE.fullmatch(source_name)
            if not source_match:
                raise ValueError("nome do artefato de origem inválido")
            if (
                source_match.group("mode") != contract.get("mode")
                or source_match.group("date") != contract.get("dateBrt")
            ):
                raise ValueError("modo/data da origem não correspondem ao contrato")

            source, _source_mtime = _read_json_artifact_bounded(path.parent / source_name)
            source_contract = source.get("artifactContract")
            if not isinstance(source_contract, dict):
                raise ValueError("artifactContract da origem ausente")
            _require_exact_object_keys(
                source_contract,
                {
                    "schemaVersion", "kind", "version", "mode", "runId",
                    "dateBrt", "generatedAt", "contentSha256",
                },
                "artifactContract da origem",
            )
            source_run_id = _require_uuid(
                source_contract.get("runId"), "runId da origem"
            )
            if (
                source_match.group("run_id") is not None
                and source_match.group("run_id") != run_id.lower()
            ):
                raise ValueError("runId do snapshot não corresponde ao _truly_new")
            if (
                source_contract.get("schemaVersion") != 1
                or source_contract.get("kind") != "curator-report"
                or source_contract.get("version") != CURATOR_VERSION
                or source_contract.get("mode") != contract.get("mode")
                or source_contract.get("dateBrt") != contract.get("dateBrt")
                or source_run_id != run_id
            ):
                raise ValueError("contrato da origem não corresponde ao _truly_new")
            source_generated_ts = _contract_timestamp(
                source_contract.get("generatedAt"), max_age_sec=max_age_sec
            )
            if source_generated_ts > generated_ts + 1:
                raise ValueError("a origem foi gerada depois do _truly_new")
            if source_contract.get("contentSha256") != source_hash:
                raise ValueError("hash declarado da origem não corresponde ao _truly_new")
            if (
                _python_json_hash_is_node_stable(source)
                and _json_content_sha256(
                    source, contract_key="artifactContract",
                ) != source_hash
            ):
                raise ValueError(
                    "conteúdo do artefato de origem não corresponde ao hash"
                )
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        return {
            "id": check_id,
            "label": label,
            "status": "missing",
            "blocking": True,
            "detail": f"{path.name}: {str(exc)[:160]}",
        }
    return {
        "id": check_id,
        "label": label,
        "status": "ok",
        "blocking": True,
        "detail": f"{path.name}: contrato íntegro e recente",
    }


def _whatwg_form_encode(value: str) -> str:
    encoded: list[str] = []
    for byte in value.encode("utf-8"):
        if (
            ord("a") <= byte <= ord("z")
            or ord("A") <= byte <= ord("Z")
            or ord("0") <= byte <= ord("9")
            or byte in {ord("*"), ord("-"), ord("."), ord("_")}
        ):
            encoded.append(chr(byte))
        elif byte == 0x20:
            encoded.append("+")
        else:
            encoded.append(f"%{byte:02X}")
    return "".join(encoded)


def _canonical_pipeline_url(value: object) -> Optional[str]:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = urllib.parse.urlsplit(value.strip())
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            return None
        if parsed.username or parsed.password:
            return None
        port = parsed.port
    except (TypeError, ValueError):
        return None

    host = parsed.hostname.lower().rstrip(".")
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    if port is not None and not (
        (parsed.scheme.lower() == "http" and port == 80)
        or (parsed.scheme.lower() == "https" and port == 443)
    ):
        host = f"{host}:{port}"
    normalized_path = re.sub(r"/+$", "", parsed.path or "/").lower()

    try:
        query_pairs = urllib.parse.parse_qsl(
            parsed.query,
            keep_blank_values=True,
            strict_parsing=False,
            encoding="utf-8",
            errors="strict",
            max_num_fields=1000,
        )
    except (TypeError, UnicodeError, ValueError):
        return None

    event_id: Optional[str] = None
    if normalized_path == "/events":
        event_value = next((item for key, item in query_pairs if key == "event"), "")
        if re.fullmatch(r"[0-9]+", event_value):
            event_id = event_value.lstrip("0") or "0"
    if event_id is None:
        event_match = re.search(r"/e/([0-9]+)(?:-|$)", normalized_path)
        if event_match:
            event_id = event_match.group(1).lstrip("0") or "0"
    if event_id is not None:
        return f"{host}/events/{event_id}"

    semantic_pairs = sorted(
        [
            (key, item)
            for key, item in query_pairs
            if not _PIPELINE_TRACKING_PARAMETER_RE.fullmatch(key)
        ],
        key=lambda pair: (pair[0].encode("utf-8"), pair[1].encode("utf-8")),
    )
    semantic_query = "&".join(
        f"{_whatwg_form_encode(key)}={_whatwg_form_encode(item)}"
        for key, item in semantic_pairs
    )
    return f"{host}{normalized_path}{'?' + semantic_query if semantic_query else ''}"


def _pipeline_item_identity(item: object) -> Optional[str]:
    if not isinstance(item, dict):
        return None
    for field in ("sourceUrl", "url", "link"):
        canonical = _canonical_pipeline_url(item.get(field))
        if canonical:
            return f"url:{PIPELINE_URL_IDENTITY_VERSION}:{canonical}"
    source_id = item.get("sourceId")
    if isinstance(source_id, str) and source_id.strip():
        return f"source:v1:{source_id.strip()}"
    return None


def _identity_list(values: object, label: str) -> list[str]:
    if not isinstance(values, list):
        raise ValueError(f"{label} não é uma lista")
    identities: list[str] = []
    seen: set[str] = set()
    for index, value in enumerate(values):
        if not isinstance(value, str) or not value.strip() or len(value) > 4096:
            raise ValueError(f"{label}[{index}] é inválida")
        identity = value.strip()
        if identity in seen:
            raise ValueError(f"{label} contém identidade duplicada")
        seen.add(identity)
        identities.append(identity)
    return identities


def _item_identity_list(values: object, label: str) -> list[str]:
    if not isinstance(values, list):
        raise ValueError(f"{label} não é uma lista")
    identities: list[str] = []
    for index, value in enumerate(values):
        identity = _pipeline_item_identity(value)
        if not identity:
            raise ValueError(f"{label}[{index}] não possui identidade canônica")
        identities.append(identity)
    if len(set(identities)) != len(identities):
        raise ValueError(f"{label} contém identidade duplicada")
    return identities


def _formatted_contract_check(
    path: Path,
    source_path: Path,
    *,
    max_age_sec: int = 25 * 3600,
) -> dict:
    check_id = "formatted"
    label = "Artefato _formatted íntegro"
    if not path.exists() or not path.is_file():
        return {
            "id": check_id,
            "label": label,
            "status": "missing",
            "blocking": True,
            "detail": f"execute a etapa de formatação antes; falta {path.name}",
        }
    if not source_path.exists() or not source_path.is_file():
        return {
            "id": check_id,
            "label": label,
            "status": "missing",
            "blocking": True,
            "detail": f"fonte vinculada ausente: {source_path.name}",
        }
    try:
        source_validation = _artifact_contract_check(
            "truly_new", "Artefato _truly_new íntegro", source_path,
            kind="truly-new", max_age_sec=max_age_sec,
        )
        if source_validation.get("status") != "ok":
            raise ValueError(
                "fonte vinculada inválida: " + str(source_validation.get("detail") or "")
            )
        payload, formatted_mtime = _read_json_artifact_bounded(path)
        source, _source_mtime = _read_json_artifact_bounded(source_path)
        if formatted_mtime < time.time() - max_age_sec:
            raise ValueError(f"{path.name} tem mais de {max_age_sec // 3600}h")
        contract = payload.get("pipelineContract")
        source_contract = source.get("artifactContract")
        if not isinstance(contract, dict):
            raise ValueError("pipelineContract ausente")
        if not isinstance(source_contract, dict):
            raise ValueError("artifactContract da origem ausente")
        _require_exact_object_keys(
            contract,
            {
                "schemaVersion", "sourceArtifact", "sourceContentSha256",
                "sourceRunId", "generatedAt", "expectedIdentities",
                "formattedIdentities", "skippedAlreadyPublishedIdentities",
                "failedFormattingIdentities", "contentSha256",
            },
            "pipelineContract",
        )
        if contract.get("schemaVersion") != 1:
            raise ValueError("esquema do artefato formatado incompatível")
        if contract.get("sourceArtifact") != source_path.name:
            raise ValueError("o nome da origem não corresponde ao _truly_new")
        if contract.get("sourceContentSha256") != source_contract.get("contentSha256"):
            raise ValueError("o hash da origem não corresponde ao _truly_new")
        source_run_id = _require_uuid(contract.get("sourceRunId"), "sourceRunId")
        if source_run_id != source_contract.get("runId"):
            raise ValueError("o runId da origem não corresponde ao _truly_new")
        generated_ts = _contract_timestamp(contract.get("generatedAt"), max_age_sec=max_age_sec)
        source_generated_ts = _contract_timestamp(
            source_contract.get("generatedAt"), max_age_sec=max_age_sec
        )
        if generated_ts + 1 < source_generated_ts:
            raise ValueError("o artefato formatado é mais antigo que a origem")
        expected_hash = str(contract.get("contentSha256") or "")
        if not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
            raise ValueError("hash SHA-256 do artefato formatado ausente ou inválido")
        if _python_json_hash_is_node_stable(payload):
            actual_hash = _json_content_sha256(
                payload, contract_key="pipelineContract",
            )
            if actual_hash != expected_hash:
                raise ValueError(
                    "o hash SHA-256 do artefato formatado não corresponde ao conteúdo"
                )
        items = payload.get("items")
        expected = _identity_list(contract.get("expectedIdentities"), "expectedIdentities")
        formatted = _identity_list(contract.get("formattedIdentities"), "formattedIdentities")
        skipped = _identity_list(
            contract.get("skippedAlreadyPublishedIdentities"),
            "skippedAlreadyPublishedIdentities",
        )
        failed = _identity_list(
            contract.get("failedFormattingIdentities"),
            "failedFormattingIdentities",
        )
        partitions = (set(formatted), set(skipped), set(failed))
        if any(partitions[left] & partitions[right] for left, right in ((0, 1), (0, 2), (1, 2))):
            raise ValueError("partições de identidade se sobrepõem")
        if set(expected) != set().union(*partitions):
            raise ValueError("partições de identidade não cobrem a origem")

        source_expected = _item_identity_list(source.get("publishable"), "publishable da origem")
        if set(source_expected) != set(expected) or len(source_expected) != len(expected):
            raise ValueError("expectedIdentities não corresponde à origem")
        formatted_from_items = _item_identity_list(items, "items formatados")
        if set(formatted_from_items) != set(formatted) or len(formatted_from_items) != len(formatted):
            raise ValueError("formattedIdentities não corresponde aos items")
        for index, item in enumerate(items):
            if (
                item.get("formatted") is not True
                or not isinstance(item.get("formattedDescription"), str)
                or not item.get("formattedDescription").strip()
            ):
                raise ValueError(f"items[{index}] não foi formatado com sucesso")
        if failed:
            failure_evidence = _item_identity_list(
                payload.get("formatFailures"), "formatFailures"
            )
            if set(failure_evidence) != set(failed) or len(failure_evidence) != len(failed):
                raise ValueError("formatFailures não corresponde às falhas declaradas")
            if not items:
                raise ValueError("artefato com falhas não possui nenhum item formatado")
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        return {
            "id": check_id,
            "label": label,
            "status": "missing",
            "blocking": True,
            "detail": f"{path.name}: {str(exc)[:160]}",
        }
    return {
        "id": check_id,
        "label": label,
        "status": "ok",
        "blocking": True,
        "detail": f"{path.name}: hash, origem, execução e atualização confirmados",
    }


_ARTIFACT_VALIDATOR_OPERATIONS = {
    "duplicates": "truly-new",
    "format": "truly-new",
    "publish": "formatted",
}
_ARTIFACT_VALIDATOR_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


def _artifact_container_path(path: Path) -> str:
    workspace = PIPELINE_WORKSPACE_PATH.resolve()
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(workspace)
    except ValueError as exc:
        raise ValueError("artefato fora do workspace canônico") from exc
    return str(
        PurePosixPath(OPENCLAW_WORKSPACE_CONTAINER)
        / PurePosixPath(*relative.parts)
    )


def _artifact_validator_spec(stage_id: str) -> Optional[dict]:
    """Bind a downstream stage to its successful, persisted Curator run."""

    operation = _ARTIFACT_VALIDATOR_OPERATIONS.get(stage_id)
    if operation is None:
        return None

    date_brt = _today_tag()
    scrape_dir = _scrape_dir()
    truly_new_path = scrape_dir / f"_truly_new_{date_brt}.json"
    truly_new, _mtime = _read_json_artifact_bounded(truly_new_path)
    contract = truly_new.get("artifactContract")
    if not isinstance(contract, dict):
        raise ValueError("_truly_new sem artifactContract")

    run_id = str(contract.get("runId") or "").lower()
    mode = str(contract.get("mode") or "")
    source_name = contract.get("sourceArtifact")
    source_match = (
        _CURATOR_SOURCE_ARTIFACT_RE.fullmatch(source_name)
        if isinstance(source_name, str)
        else None
    )
    if not _ARTIFACT_VALIDATOR_UUID_RE.fullmatch(run_id):
        raise ValueError("runId da origem não é um UUID aceito pelo Curador")
    if mode not in {"daily", "full", "ig-only", "quick"}:
        raise ValueError("modo da origem é inválido")
    if contract.get("dateBrt") != date_brt:
        raise ValueError("data BRT da origem não corresponde a hoje")
    if (
        source_match is None
        or source_match.group("mode") != mode
        or source_match.group("date") != date_brt
        or (
            source_match.group("run_id") is not None
            and source_match.group("run_id") != run_id
        )
    ):
        raise ValueError("nome do relatório Curador não corresponde à origem")

    conn = _db()
    try:
        source_run = conn.execute(
            """SELECT id, stage, status, started_at, exit_code, dry_run
               FROM runs WHERE id = ?""",
            (run_id,),
        ).fetchone()
    finally:
        conn.close()
    if source_run is None:
        raise ValueError("execução fonte do Curador não existe no histórico local")
    if (
        source_run["stage"] not in {"curator", "all"}
        or source_run["status"] != "finished"
        or source_run["exit_code"] != 0
        or int(source_run["dry_run"] or 0) != 0
    ):
        raise ValueError(
            "execução fonte não é um Curador real concluído com sucesso"
        )
    started_at = source_run["started_at"]
    if (
        isinstance(started_at, bool)
        or not isinstance(started_at, int)
        or started_at <= 0
        or started_at > int(time.time()) + 5 * 60
    ):
        raise ValueError("horário da execução fonte é inválido")

    curator_path = scrape_dir / source_name
    formatted_path = scrape_dir / f"_formatted_{date_brt}.json"
    paths = {
        "curator": curator_path,
        "trulyNew": truly_new_path,
    }
    if operation == "formatted":
        paths["formatted"] = formatted_path
    return {
        "operation": operation,
        "run_id": run_id,
        "mode": mode,
        "date_brt": date_brt,
        "started_at_ms": started_at * 1000,
        "paths": paths,
        "container_paths": {
            role: _artifact_container_path(path)
            for role, path in paths.items()
        },
    }


def _artifact_validator_command(spec: dict) -> list[str]:
    validator_path = str(
        PurePosixPath(OPENCLAW_WORKSPACE_CONTAINER)
        / PIPELINE_ARTIFACT_VALIDATOR_RELATIVE
    )
    command = [
        "node",
        validator_path,
        f"--operation={spec['operation']}",
        f"--curator={spec['container_paths']['curator']}",
        f"--run-id={spec['run_id']}",
        f"--mode={spec['mode']}",
        f"--date-brt={spec['date_brt']}",
        f"--started-at-ms={spec['started_at_ms']}",
    ]
    if spec["operation"] in {"truly-new", "formatted"}:
        command.append(
            f"--truly-new={spec['container_paths']['trulyNew']}"
        )
    if spec["operation"] == "formatted":
        command.append(
            f"--formatted={spec['container_paths']['formatted']}"
        )
    return command


def _validate_artifact_receipt(receipt: object, spec: dict) -> None:
    if not isinstance(receipt, dict):
        raise ValueError("receipt do validador não é um objeto")
    _require_exact_object_keys(
        receipt,
        {
            "schemaVersion", "operation", "ok", "issues", "issueCount",
            "issuesTruncated", "binding", "files",
        },
        "receipt do validador",
    )
    if receipt.get("schemaVersion") != 1:
        raise ValueError("versão do receipt do validador é incompatível")
    if receipt.get("operation") != spec["operation"]:
        raise ValueError("operação do receipt não corresponde ao estágio")
    issues = receipt.get("issues")
    issue_count = receipt.get("issueCount")
    if (
        not isinstance(issues, list)
        or len(issues) > 64
        or any(
            not isinstance(value, str)
            or not value
            or len(value) > 240
            for value in issues
        )
        or isinstance(issue_count, bool)
        or not isinstance(issue_count, int)
        or issue_count < len(issues)
        or not isinstance(receipt.get("issuesTruncated"), bool)
    ):
        raise ValueError("lista de issues do receipt é inválida")

    binding = receipt.get("binding")
    if not isinstance(binding, dict):
        raise ValueError("binding do receipt está ausente")
    _require_exact_object_keys(
        binding,
        {
            "runId", "mode", "dateBrt", "urlIdentityVersion",
            "curatorPublishableIdentities",
        },
        "binding do receipt",
    )
    identity_count = binding.get("curatorPublishableIdentities")
    if (
        binding.get("runId") != spec["run_id"]
        or binding.get("mode") != spec["mode"]
        or binding.get("dateBrt") != spec["date_brt"]
        or binding.get("urlIdentityVersion") != PIPELINE_URL_IDENTITY_VERSION
        or isinstance(identity_count, bool)
        or not isinstance(identity_count, int)
        or not 0 <= identity_count <= 1_000_000
    ):
        raise ValueError("binding do receipt diverge da execução fonte")

    files = receipt.get("files")
    expected_roles = set(spec["paths"])
    if not isinstance(files, dict) or set(files) != expected_roles:
        raise ValueError("inventário de arquivos do receipt é incompatível")
    for role, host_path in spec["paths"].items():
        fingerprint = files.get(role)
        if not isinstance(fingerprint, dict):
            raise ValueError(f"fingerprint {role} está ausente")
        _require_exact_object_keys(
            fingerprint,
            {"name", "size", "bytesSha256", "contractSha256"},
            f"fingerprint {role}",
        )
        size = fingerprint.get("size")
        if (
            fingerprint.get("name") != host_path.name
            or isinstance(size, bool)
            or not isinstance(size, int)
            or not 0 < size <= PIPELINE_ARTIFACT_MAX_BYTES
            or not re.fullmatch(
                r"[0-9a-f]{64}", str(fingerprint.get("bytesSha256") or ""),
            )
            or not re.fullmatch(
                r"[0-9a-f]{64}", str(fingerprint.get("contractSha256") or ""),
            )
        ):
            raise ValueError(f"fingerprint {role} é inválido")


def _node_artifact_contract_check(stage_id: str) -> Optional[dict]:
    if stage_id not in _ARTIFACT_VALIDATOR_OPERATIONS:
        return None
    label = "Linhagem canônica dos artefatos (Node.js)"
    try:
        spec = _artifact_validator_spec(stage_id)
        if spec is None:
            raise ValueError("estágio sem operação de validação")
        completed = subprocess.run(
            [
                "docker", "exec", "--user", OPENCLAW_RUNTIME_USER,
                OPENCLAW_CONTAINER, *_artifact_validator_command(spec),
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
            check=False,
        )
        stdout = completed.stdout or b""
        stderr = completed.stderr or b""
        if (
            len(stdout) > PIPELINE_ARTIFACT_RECEIPT_MAX_BYTES
            or stderr
            or not stdout.endswith(b"\n")
            or stdout.count(b"\n") != 1
        ):
            raise ValueError("saída do validador não é uma receipt única e limitada")
        try:
            receipt = json.loads(
                stdout[:-1].decode("utf-8"),
                object_pairs_hook=_reject_duplicate_artifact_pairs,
                parse_constant=_reject_non_finite_artifact_number,
            )
        except (UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError("receipt do validador não é JSON estrito") from exc
        _validate_artifact_receipt(receipt, spec)
        expected_ok = completed.returncode == 0
        if receipt.get("ok") is not expected_ok:
            raise ValueError("exit code e estado do receipt divergem")
        if not expected_ok:
            issues = receipt.get("issues") or ["validation_failed"]
            raise ValueError(
                "validador rejeitou a linhagem: " + ",".join(issues[:8])
            )
        if (
            receipt.get("issueCount") != 0
            or receipt.get("issues") != []
            or receipt.get("issuesTruncated") is not False
        ):
            raise ValueError("receipt de sucesso contém issues")
    except (
        OSError, TypeError, ValueError, json.JSONDecodeError,
        subprocess.TimeoutExpired,
    ) as exc:
        return {
            "id": "artifact_node_validator",
            "label": label,
            "status": "missing",
            "blocking": True,
            "detail": str(exc)[:240],
        }
    return {
        "id": "artifact_node_validator",
        "label": label,
        "status": "ok",
        "blocking": True,
        "detail": (
            f"{spec['operation']}: hashes JSON.stringify, identidades e "
            "execução fonte confirmados"
        ),
    }


def _stage_artifact_checks(stage_id: str) -> list[dict]:
    today = _today_tag()
    scrape_dir = _scrape_dir()
    truly_new = scrape_dir / f"_truly_new_{today}.json"
    formatted = scrape_dir / f"_formatted_{today}.json"
    checks: list[dict] = []

    if stage_id in {"duplicates", "format", "publish"}:
        checks.append(_artifact_contract_check(
            "truly_new",
            "Artefato _truly_new íntegro",
            truly_new,
            kind="truly-new",
        ))

    if stage_id == "publish":
        checks.append(_formatted_contract_check(formatted, truly_new))

    return checks


def get_stage_preflight(stage_id: str, deep: bool = False) -> dict:
    if stage_id not in PIPELINE_STAGES:
        raise ValueError(f"etapa desconhecida: {stage_id}")
    stage = PIPELINE_STAGES[stage_id]
    profile = PIPELINE_STAGE_PROFILES.get(stage_id, {})
    script_info = _stage_script_info(stage)

    checks = [{
        "id": "script",
        "label": "Script no ambiente de trabalho",
        "status": "ok" if script_info["exists"] else "missing",
        "blocking": True,
        "detail": script_info["relative_path"],
    }]

    checks.append({
        "id": "node",
        "label": "Node.js no OpenClaw",
        "status": "unchecked",
        "blocking": False,
        "detail": "validado ao iniciar a execução; use deep=true para testar agora",
    })

    if deep and script_info["exists"]:
        checks.append(_stage_node_dependency_check(stage_id, stage))

    for req in profile.get("requirements", []):
        deep_check = _deep_requirement_check(req) if deep else None
        if deep_check:
            checks.append(deep_check)
            continue
        has_env = _env_requirement_present(req)
        status = "ok" if has_env else ("unchecked" if req == "browser_cdp" and not deep else "missing")
        checks.append({
            "id": req,
            "label": REQUIREMENT_LABELS.get(req, req),
            "status": status,
            "blocking": req != "browser_cdp" or deep,
            "detail": "presente no ambiente/.env" if has_env else "não confirmado sem expor segredos",
        })

    for req in profile.get("optional_requirements", []):
        has_env = _env_requirement_present(req)
        checks.append({
            "id": req,
            "label": REQUIREMENT_LABELS.get(req, req),
            "status": "ok" if has_env else "warning",
            "blocking": False,
            "detail": (
                "presente no ambiente/.env"
                if has_env else "opcional; a etapa continuará no modo sem IA"
            ),
        })

    checks.extend(_stage_artifact_checks(stage_id))
    if deep:
        artifact_node_check = _node_artifact_contract_check(stage_id)
        if artifact_node_check is not None:
            checks.append(artifact_node_check)

    blockers = [c for c in checks if c.get("blocking") and c.get("status") != "ok"]
    warnings = [c for c in checks if not c.get("blocking") and c.get("status") in ("missing", "warning")]
    command = "node " + stage.script + ((" " + " ".join(stage.args)) if stage.args else "")

    return {
        "stage": stage_id,
        "checked_at": int(time.time()),
        "workspace": str(PIPELINE_WORKSPACE_PATH),
        "command": command,
        "script": script_info,
        "profile": {
            "risk": profile.get("risk", "unknown"),
            "mode": profile.get("mode", stage.category),
            "mutates_platform": bool(profile.get("mutates_platform")),
            "dry_run_available": bool(profile.get("dry_run_available")),
            "default_dry_run": bool(profile.get("default_dry_run")),
            "force_dry_run": bool(profile.get("force_dry_run")),
            "effects": profile.get("effects", []),
            "optional_requirements": profile.get("optional_requirements", []),
            "notes": profile.get("notes", []),
        },
        "checks": checks,
        "can_run": len(blockers) == 0,
        "blockers": blockers,
        "warnings": warnings,
    }


def get_pipeline_preflight(deep: bool = False) -> dict:
    stages = [get_stage_preflight(stage_id, deep=deep) for stage_id in PIPELINE_STAGES]
    blocked = [s for s in stages if not s.get("can_run")]
    warned = [s for s in stages if s.get("warnings")]
    summary = {
        "total": len(stages),
        "runnable": len(stages) - len(blocked),
        "blocked": len(blocked),
        "with_warnings": len(warned),
    }
    return {
        "checked_at": int(time.time()),
        "deep": deep,
        "workspace": str(PIPELINE_WORKSPACE_PATH),
        "stages": stages,
        "summary": summary,
        **summary,
    }


def summarize_log_text(text: str) -> dict:
    bounded_text = text or ""
    if len(bounded_text) > PIPELINE_SUMMARY_MAX_TEXT_CHARS:
        half = PIPELINE_SUMMARY_MAX_TEXT_CHARS // 2
        bounded_text = (
            bounded_text[:half]
            + "\n...[log middle omitted for bounded summary]...\n"
            + bounded_text[-half:]
        )
    lines = bounded_text.splitlines()
    labels = {}
    metrics = {}
    warnings: deque[str] = deque(maxlen=8)
    duration_sec = None
    structured_steps: list[dict] = []
    legacy_steps: list[dict] = []
    declared_outcome: Optional[dict] = None
    funnel_markers: list[dict] = []
    funnel_marker_count = 0

    for raw_line in lines:
        # O formatador pode emitir JSON em uma única linha com dezenas de KiB.
        # Aplicar regex com prefixos curingas nessa linha causava custo quadrático
        # (72 KiB sem match consumiam ~29s de CPU). Nenhuma evidência operacional
        # legítima precisa de uma linha maior que este limite.
        line = raw_line[:PIPELINE_SUMMARY_MAX_LINE_CHARS]
        step_payload = _marker_payload(line, STEP_MARKER)
        if step_payload is not None:
            step = _normalize_step_marker(step_payload)
            if step:
                structured_steps.append(step)
            continue

        outcome_payload = _marker_payload(line, OUTCOME_MARKER)
        if outcome_payload is not None:
            declared_outcome = outcome_payload
            continue

        if line.strip().startswith(FUNNEL_MARKER):
            funnel_marker_count += 1
            funnel_payload = _marker_payload(line, FUNNEL_MARKER)
            normalized_funnel = (
                _normalize_funnel_marker(funnel_payload)
                if funnel_payload is not None else None
            )
            if normalized_funnel is not None:
                funnel_markers.append(normalized_funnel)
            else:
                warnings.append("Marcador estruturado do funil inválido")
            continue

        normalized = _strip_accents(line)
        low = normalized.lower()
        if "pipeline concluido em" in low:
            duration_match = re.search(r"PIPELINE CONCLUIDO em\s+([\d.]+)s", normalized, re.I)
            if duration_match:
                duration_sec = float(duration_match.group(1))

        if "exit code" in low:
            exit_match = re.search(r"(.+?)\s+(?:—|–|-)?\s*exit code\s+(-?\d+)\s*$", line, re.I)
            if exit_match:
                legacy_steps.append(_infer_legacy_step(exit_match.group(1), int(exit_match.group(2))))

        if ":" in line:
            left, right = line.split(":", 1)
            key = SUMMARY_KEYS.get(_normalize_key(left))
            # Todas as chaves de summary sao contagens. Um cabecalho vazio como
            # "Sites:" nao pode apagar o valor numerico lido anteriormente.
            if key and re.search(r"-?\d+(?:[.,]\d+)?", right or ""):
                metric_key, label = key
                value = _coerce_metric(right)
                labels[label] = str(value)
                metrics[metric_key] = value

        if any(token in low for token in ("erro", "falhou", "failed", "quality_blocked", "parse do")):
            clean = line.strip()
            if clean and clean not in warnings:
                warnings.append(clean[:300])

        profile_match = (
            re.search(r"(\d+)\s+perfis\s+OK\s+\|\s+.*?(\d+)\s+falhas", normalized, re.I)
            if "perfis ok" in low and "falhas" in low else None
        )
        if profile_match:
            metrics["ig_profiles_ok"] = int(profile_match.group(1))
            metrics["ig_profiles_failed"] = int(profile_match.group(2))
            labels["IG perfis OK"] = profile_match.group(1)
            labels["IG falhas"] = profile_match.group(2)

        posts_match = (
            re.search(r"(\d+)\s+novos\s+posts\s+2026\s+\((\d+)\s+relevantes\)", normalized, re.I)
            if "novos posts 2026" in low and "relevantes" in low else None
        )
        if posts_match:
            metrics["ig_new_posts"] = int(posts_match.group(1))
            metrics["ig_relevant_posts"] = int(posts_match.group(2))
            labels["IG novos posts"] = posts_match.group(1)
            labels["IG relevantes"] = posts_match.group(2)

        skipped_match = (
            re.search(r"(\d+)\s+posts\s+ja\s+analisados", normalized, re.I)
            if "posts ja analisados" in low else None
        )
        if skipped_match:
            metrics["ig_seen_skipped"] = int(skipped_match.group(1))
            labels["IG já vistos"] = skipped_match.group(1)

        if "profile_unavailable" in low:
            clean = line.strip()
            if clean and clean not in warnings:
                warnings.append(clean[:300])

    if structured_steps:
        steps = list(structured_steps)
        seen_step_evidence = {
            (step.get("id"), step.get("ok"), step.get("exit_code"), step.get("signal"))
            for step in steps
        }
        for legacy_step in legacy_steps:
            fingerprint = (
                legacy_step.get("id"), legacy_step.get("ok"),
                legacy_step.get("exit_code"), legacy_step.get("signal"),
            )
            if fingerprint not in seen_step_evidence:
                steps.append(legacy_step)
                seen_step_evidence.add(fingerprint)
    else:
        steps = legacy_steps
    outcome = (
        _normalize_outcome_marker(declared_outcome, steps)
        if declared_outcome is not None
        else _derive_outcome_from_steps(steps, source="derived_step_evidence")
    )
    funnel = funnel_markers[0] if funnel_marker_count == 1 and len(funnel_markers) == 1 else None
    if funnel_marker_count > 1:
        warnings.append("Marcador estruturado do funil ambíguo")
    if funnel is not None:
        for key, value in funnel.items():
            if key not in {"schema_version", "run_id", "dry_run"} and value is not None:
                metrics[key] = value
                labels[FUNNEL_LABELS[key]] = str(value)

        # Aliases anteriores continuam disponíveis, mas passam a derivar da
        # fase estruturada correspondente em vez da última linha que venceu.
        compatibility_metrics = {
            "sites_scanned": funnel.get("collection_attempted"),
            "total_items": funnel.get("collected_items"),
            "review": funnel.get("curator_review"),
            "discarded": funnel.get("curator_discarded"),
            "published": funnel.get("created"),
        }
        compatibility_labels = {
            "sites_scanned": "Sites escaneados",
            "total_items": "Total itens",
            "review": "Revisão",
            "discarded": "Descartados",
            "published": "Publicados",
        }
        for key, value in compatibility_metrics.items():
            if value is not None:
                metrics[key] = value
                labels[compatibility_labels[key]] = str(value)

    # Compatibilidade: `publishable` continua sendo o conjunto novo que seguia
    # para a pipeline. O PUBLISH do Curador permanece separado e não o sobrescreve.
    if "truly_new" in metrics:
        metrics["publishable"] = metrics["truly_new"]
        labels["Publicáveis"] = str(metrics["publishable"])
    elif "curator_candidates" in metrics:
        metrics["publishable"] = metrics["curator_candidates"]
        labels["Publicáveis"] = str(metrics["publishable"])
    result = {
        "labels": labels,
        "metrics": metrics,
        "warnings": list(warnings),
    }
    if steps:
        result["steps"] = steps
    if outcome:
        result["outcome"] = outcome
    if funnel is not None:
        result["funnel"] = funnel
    if duration_sec is not None:
        result["duration_sec"] = duration_sec
    return result


def _scan_log_outcome_evidence(log_path: Path, max_lines: int = 1000) -> dict:
    """Varre log grande em streaming sem reter conteudo operacional em memoria."""
    max_lines = max(20, max_lines)
    important = deque(maxlen=max_lines // 2)
    ordinary = deque(maxlen=max_lines - important.maxlen)
    try:
        for line in iter_bounded_log_lines(log_path, max_line_bytes=10000):
            low = line.lower()
            relevant = (
                STEP_MARKER in line
                or OUTCOME_MARKER in line
                or ("exit code" in low and re.search(r"exit code\s+-?\d+\s*$", line, re.I))
            )
            if not relevant:
                continue
            clean = line[:10000]
            is_failure = bool(
                OUTCOME_MARKER in clean
                or ('"status"' in low and re.search(r'"status"\s*:\s*"(?:failed|blocked)"', clean, re.I))
                or ("exit code" in low and re.search(r"exit code\s+(?!0\s*$)-?\d+\s*$", clean, re.I))
            )
            (important if is_failure else ordinary).append(clean)
    except OSError:
        return {}
    evidence = [*ordinary, *important]
    return summarize_log_text("\n".join(evidence)) if evidence else {}


@lru_cache(maxsize=256)
def _summarize_completed_log_cached(
    log_path_value: str,
    size: int,
    mtime_ns: int,
    tail_bytes: int,
    head_bytes: int,
) -> dict:
    """Resume um snapshot imutavel de log e evita CPU repetida nos GETs."""
    del mtime_ns  # faz parte da chave do cache; o valor nao e usado no parser.
    log_path = Path(log_path_value)
    try:
        with open(log_path, "rb") as f:
            if size > head_bytes + tail_bytes:
                head = f.read(head_bytes).decode("utf-8", errors="replace")
                f.seek(-tail_bytes, os.SEEK_END)
                tail = f.read().decode("utf-8", errors="replace")
                text = head + "\n...[log middle omitted for summary]...\n" + tail
            else:
                text = f.read().decode("utf-8", errors="replace")
        summary = summarize_log_text(text)
        outcome_source = (summary.get("outcome") or {}).get("source", "")
        has_declared_outcome = outcome_source.startswith("marker")
        if size > head_bytes + tail_bytes and not has_declared_outcome:
            evidence_summary = _scan_log_outcome_evidence(log_path)
            if evidence_summary.get("steps"):
                summary["steps"] = evidence_summary["steps"]
            if evidence_summary.get("outcome"):
                summary["outcome"] = evidence_summary["outcome"]
        return summary
    except Exception as e:
        return {"labels": {}, "metrics": {}, "warnings": [f"erro_ao_resumir: {e}"]}


def summarize_run(run: dict, tail_bytes: int = 65536, head_bytes: int = 65536) -> dict:
    log_path = Path(run.get("log_path") or "")
    if not log_path.exists() or not log_path.is_file():
        return {"labels": {}, "metrics": {}, "warnings": [], "missing_log": True}
    try:
        stat = log_path.stat()
    except OSError as e:
        return {"labels": {}, "metrics": {}, "warnings": [f"erro_ao_resumir: {e}"]}
    summary = _summarize_completed_log_cached(
        str(log_path), stat.st_size, stat.st_mtime_ns, tail_bytes, head_bytes,
    )
    # Os consumidores enriquecem o dict retornado; nao exponha o objeto do cache.
    return copy.deepcopy(summary)


def _with_run_summary(run: Optional[dict]) -> Optional[dict]:
    if not run:
        return run
    enriched = dict(run)
    if "dry_run" in enriched:
        enriched["dry_run"] = bool(enriched["dry_run"])
    summary = summarize_run(enriched)
    if (
        summary.get("metrics")
        or summary.get("warnings")
        or summary.get("steps")
        or summary.get("outcome")
        or summary.get("duration_sec") is not None
    ):
        enriched["summary"] = summary
    return enriched


def _with_effective_outcome(run: Optional[dict]) -> Optional[dict]:
    if not run:
        return run
    enriched = _with_run_summary(run) if run.get("status") not in ACTIVE_RUN_STATUSES else dict(run)
    if "dry_run" in enriched:
        enriched["dry_run"] = bool(enriched["dry_run"])
    summary = enriched.get("summary") or {}
    outcome = summary.get("outcome") or None
    wrapper_status = enriched.get("status")
    if (
        wrapper_status in NON_SUCCESS_TERMINAL_RUN_STATUSES
        and isinstance(outcome, dict)
        and outcome.get("status") == "success"
    ):
        # Step evidence describes only children that emitted a terminal marker.
        # A stopped/timed-out wrapper may therefore have three successful steps
        # and still never complete the pipeline. Keep those steps, but do not
        # expose their aggregate as the outcome of the interrupted run.
        step_outcome = outcome
        outcome = copy.deepcopy(step_outcome)
        outcome.update({
            "status": "failed",
            "source": "terminal_status_reconciled_with_steps",
            "terminal_status": wrapper_status,
            "step_outcome_status": "success",
            "step_outcome_source": step_outcome.get("source"),
        })
        summary = dict(summary)
        summary["outcome"] = outcome
        enriched["summary"] = summary
    outcome_status = outcome.get("status") if isinstance(outcome, dict) else None
    if outcome_status not in VALID_OUTCOME_STATUSES:
        outcome_status = None
    effective_status = outcome_status or wrapper_status
    if wrapper_status in NON_SUCCESS_TERMINAL_RUN_STATUSES:
        effective_status = wrapper_status
    enriched["outcome"] = outcome
    enriched["outcome_status"] = outcome_status
    enriched["effective_status"] = effective_status
    enriched["steps"] = summary.get("steps") or []
    return enriched


# ---------- In-memory Popen handles ----------
# run_id → subprocess.Popen (válido enquanto run estiver running).
# Permite poll() e terminate() corretos sem depender de /proc/PID (que está em outro namespace).

_RUN_HANDLES: dict[str, subprocess.Popen] = {}
_SSE_CONNECTION_LOCK = threading.Lock()
_SSE_CONNECTIONS_ACTIVE = 0


def _try_acquire_sse_slot() -> bool:
    global _SSE_CONNECTIONS_ACTIVE
    with _SSE_CONNECTION_LOCK:
        if _SSE_CONNECTIONS_ACTIVE >= PIPELINE_SSE_MAX_CONNECTIONS:
            return False
        _SSE_CONNECTIONS_ACTIVE += 1
        return True


def _release_sse_slot() -> None:
    global _SSE_CONNECTIONS_ACTIVE
    with _SSE_CONNECTION_LOCK:
        _SSE_CONNECTIONS_ACTIVE = max(0, _SSE_CONNECTIONS_ACTIVE - 1)


def _sse_connection_count() -> int:
    with _SSE_CONNECTION_LOCK:
        return _SSE_CONNECTIONS_ACTIVE


# ---------- CRUD de runs ----------

class DuplicateRunError(Exception):
    """Já existe uma execução ativa que compartilha os artefatos da pipeline."""
    def __init__(self, existing_run_id: str, stage: str, existing_stage: Optional[str] = None):
        active_stage = existing_stage or stage
        super().__init__(
            f"pipeline ocupada pela etapa '{active_stage}' "
            f"(run_id={existing_run_id}); não é seguro iniciar '{stage}' em paralelo"
        )
        self.existing_run_id = existing_run_id
        self.stage = stage
        self.existing_stage = active_stage


def resolve_stage_dry_run(stage_id: str, requested: Optional[bool]) -> bool:
    if stage_id not in PIPELINE_STAGES:
        raise ValueError(f"etapa desconhecida: {stage_id}")
    if requested is not None and type(requested) is not bool:
        raise ValueError("dry_run deve ser booleano estrito")
    profile = PIPELINE_STAGE_PROFILES.get(stage_id) or {}
    available = profile.get("dry_run_available") is True
    if profile.get("force_dry_run") is True:
        if requested is False:
            raise ValueError(f"a etapa oferece somente dry-run: {stage_id}")
        return True
    if requested is True and not available:
        raise ValueError(f"a etapa não oferece dry-run: {stage_id}")
    if requested is None:
        return available and profile.get("default_dry_run") is True
    return requested is True


def _validated_run_id(run_id: str) -> str:
    try:
        normalized = str(uuid.UUID(str(run_id)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("run_id inválido") from exc
    if normalized != str(run_id).lower():
        raise ValueError("run_id inválido")
    return normalized


def managed_run_log_path(
    run_id: str,
    path_value: Optional[str] = None,
    *,
    must_exist: bool = False,
) -> Path:
    """Retorna somente o log regular e exclusivo pertencente ao run.

    O caminho persistido no SQLite não é tratado como autoridade: precisa ser
    exatamente ``PIPELINE_LOG_DIR/<uuid>.log`` depois de resolver o diretório.
    Isso evita leitura/remoção arbitrária caso um registro seja corrompido.
    """
    normalized = _validated_run_id(run_id)
    log_root = PIPELINE_LOG_DIR.resolve(strict=False)
    expected = log_root / f"{normalized}.log"
    candidate = Path(path_value) if path_value else expected
    try:
        resolved = candidate.resolve(strict=False)
    except OSError as exc:
        raise ValueError("log_path inválido") from exc
    if resolved != expected:
        raise ValueError("log_path fora do diretório gerenciado")
    if candidate.exists() or candidate.is_symlink():
        try:
            info = candidate.lstat()
        except OSError as exc:
            raise ValueError("log_path inacessível") from exc
        if candidate.is_symlink() or not stat.S_ISREG(info.st_mode):
            raise ValueError("log_path não é um arquivo regular")
        if info.st_nlink != 1:
            raise ValueError("log_path possui hard links")
    elif must_exist:
        raise FileNotFoundError(str(expected))
    return expected


def read_bounded_log_snapshot(
    log_path: Path,
    *,
    head_bytes: int = PIPELINE_LOG_SCAN_HEAD_BYTES,
    tail_bytes: int = PIPELINE_LOG_SCAN_TAIL_BYTES,
) -> str:
    """Lê somente head+tail de um log, com memória e I/O estritamente limitados."""
    head_bytes = max(0, min(int(head_bytes), PIPELINE_LOG_SCAN_HEAD_BYTES))
    tail_bytes = max(0, min(int(tail_bytes), PIPELINE_LOG_SCAN_TAIL_BYTES))
    size = log_path.stat().st_size
    with open(log_path, "rb") as log_file:
        if size <= head_bytes + tail_bytes:
            data = log_file.read(head_bytes + tail_bytes)
        else:
            head = log_file.read(head_bytes)
            log_file.seek(-tail_bytes, os.SEEK_END)
            tail = log_file.read(tail_bytes)
            data = head + b"\n...[log middle omitted]...\n" + tail
    return data.decode("utf-8", errors="replace")


def read_log_tail(
    log_path: Path,
    max_lines: int,
    *,
    max_bytes: int = PIPELINE_LOG_TAIL_MAX_BYTES,
) -> tuple[str, bool]:
    """Lê o sufixo do arquivo de trás para frente sem carregar o log inteiro."""
    if isinstance(max_lines, bool) or not isinstance(max_lines, int):
        raise ValueError("tail deve ser inteiro")
    if max_lines < 1 or max_lines > PIPELINE_LOG_TAIL_MAX_LINES:
        raise ValueError(f"tail deve estar entre 1 e {PIPELINE_LOG_TAIL_MAX_LINES}")
    max_bytes = max(4096, min(int(max_bytes), PIPELINE_LOG_TAIL_MAX_BYTES))
    size = log_path.stat().st_size
    if size == 0:
        return "", False

    chunks: deque[bytes] = deque()
    remaining = size
    captured = 0
    newline_count = 0
    block_size = min(64 * 1024, max_bytes)
    with open(log_path, "rb") as log_file:
        while remaining > 0 and captured < max_bytes and newline_count <= max_lines:
            take = min(block_size, remaining, max_bytes - captured)
            remaining -= take
            log_file.seek(remaining)
            chunk = log_file.read(take)
            if not chunk:
                break
            chunks.appendleft(chunk)
            captured += len(chunk)
            newline_count += chunk.count(b"\n")

    data = b"".join(chunks)
    lines = data.splitlines()
    selected = lines[-max_lines:]
    content = b"\n".join(selected).decode("utf-8", errors="replace")
    truncated = remaining > 0 or len(lines) > max_lines
    return content, truncated


def iter_bounded_log_lines(
    log_path: Path,
    *,
    max_line_bytes: int = 10000,
    chunk_bytes: int = 64 * 1024,
):
    """Itera o arquivo inteiro em chunks, descartando excesso de linhas gigantes."""
    max_line_bytes = max(1024, min(int(max_line_bytes), PIPELINE_SUMMARY_MAX_LINE_CHARS))
    chunk_bytes = max(1024, min(int(chunk_bytes), 256 * 1024))
    partial = bytearray()
    overflow = False

    def append_segment(segment: bytes) -> None:
        nonlocal overflow
        available = max_line_bytes - len(partial)
        if available > 0:
            partial.extend(segment[:available])
        if len(segment) > max(available, 0):
            overflow = True

    with open(log_path, "rb") as log_file:
        while True:
            chunk = log_file.read(chunk_bytes)
            if not chunk:
                break
            parts = chunk.split(b"\n")
            for segment in parts[:-1]:
                append_segment(segment)
                yield bytes(partial).rstrip(b"\r").decode("utf-8", errors="replace")
                partial.clear()
                overflow = False
            append_segment(parts[-1])
    if partial or overflow:
        yield bytes(partial).rstrip(b"\r").decode("utf-8", errors="replace")


def _runtime_file(run_id: str, suffix: str) -> Path:
    return PIPELINE_RUNTIME_DIR / f"{_validated_run_id(run_id)}.{suffix}"


def build_stage_docker_command(
    stage_id: str,
    dry_run: Optional[bool] = None,
    run_id: Optional[str] = None,
) -> tuple[list[str], bool]:
    if stage_id not in PIPELINE_STAGES:
        raise ValueError(f"etapa desconhecida: {stage_id}")
    stage = PIPELINE_STAGES[stage_id]
    effective_dry_run = resolve_stage_dry_run(stage_id, dry_run)
    runtime_args = [*stage.args]
    if effective_dry_run and "--dry-run" not in runtime_args:
        runtime_args.append("--dry-run")
    node_command = shlex.join(["node", stage.script, *runtime_args])
    docker_args = [
        "docker", "exec", "-i", "--user", OPENCLAW_RUNTIME_USER,
    ]
    if run_id is None:
        shell_command = (
            f"cd {shlex.quote(OPENCLAW_WORKSPACE_CONTAINER)} && "
            "mkdir -p /tmp/cadu-pipeline && "
            f"exec {node_command} 2>&1"
        )
    else:
        run_id = _validated_run_id(run_id)
        runtime_dir = PIPELINE_RUNTIME_DIR_CONTAINER.rstrip("/")
        pid_file = f"{runtime_dir}/{run_id}.pid"
        exit_file = f"{runtime_dir}/{run_id}.exit"
        runtime_lock = f"{runtime_dir}/runtime.lock"
        inner_command = (
            f"exec 9>> {shlex.quote(runtime_lock)}; "
            "flock -n 9 || exit 75; "
            f"printf '%s\\n' \"$$\" > {shlex.quote(pid_file)} && "
            f"{node_command} 2>&1; "
            "code=$?; "
            f"printf '%s\\n' \"$code\" > {shlex.quote(exit_file)}; "
            f"rm -f {shlex.quote(pid_file)}; "
            "exit \"$code\""
        )
        shell_command = (
            f"cd {shlex.quote(OPENCLAW_WORKSPACE_CONTAINER)} && "
            f"mkdir -p {shlex.quote(runtime_dir)} && "
            f"exec setsid --fork --wait bash -c {shlex.quote(inner_command)}"
        )
        docker_args.extend(["-e", f"CADU_PIPELINE_RUN_ID={run_id}"])
    return [
        *docker_args, OPENCLAW_CONTAINER, "bash", "-c", shell_command,
    ], effective_dry_run


def _activate_reserved_run(run_id: str, pid: int) -> None:
    conn = _db()
    try:
        cursor = conn.execute(
            """UPDATE runs SET status = 'running', pid = ?
               WHERE id = ? AND status = 'pending'""",
            (pid, run_id),
        )
        if cursor.rowcount != 1:
            raise RuntimeError(f"a reserva da execução {run_id} foi perdida antes de iniciar o processo")
        conn.commit()
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()


def _read_runtime_int(run_id: str, suffix: str) -> Optional[int]:
    path = _runtime_file(run_id, suffix)
    try:
        if path.stat().st_size > 64:
            return None
        value = int(path.read_text(encoding="utf-8").strip())
        return value
    except (OSError, ValueError):
        return None


def _reconciled_exit_code(run_id: str, cli_exit_code: Optional[int] = None) -> Optional[int]:
    recorded = _read_runtime_int(run_id, "exit")
    if recorded is not None and -255 <= recorded <= 255:
        return recorded
    # PID presente significa que o grupo interno pode continuar mesmo depois
    # de uma desconexao do cliente docker. Nesse caso, o CLI nao e prova.
    if _read_runtime_int(run_id, "pid") is not None:
        return None
    return cli_exit_code


def _runtime_lock_is_free() -> Optional[bool]:
    """True prova ausencia de wrapper/child; False indica pipeline ou deploy ativo."""
    if fcntl is None:
        return None
    lock_path = PIPELINE_RUNTIME_DIR / "runtime.lock"
    flags = os.O_APPEND | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(lock_path, flags)
    except OSError:
        return None
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            return None
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        fcntl.flock(fd, fcntl.LOCK_UN)
        return True
    except OSError:
        return None
    finally:
        os.close(fd)


def _cleanup_runtime_files(run_id: str) -> None:
    for suffix in ("pid", "exit", "stopped"):
        try:
            _runtime_file(run_id, suffix).unlink(missing_ok=True)
        except OSError:
            pass


def _terminate_tracked_container_run(run_id: str) -> bool:
    """Termina o grupo interno somente apos validar nonce e PID persistidos."""
    run_id = _validated_run_id(run_id)
    pid = None
    for _ in range(20):
        pid = _read_runtime_int(run_id, "pid")
        if pid is not None:
            break
        time.sleep(0.05)
    if pid is None or pid <= 1:
        return False
    expected_env = shlex.quote(f"CADU_PIPELINE_RUN_ID={run_id}")
    script = (
        f"pid={pid}; "
        "test -r \"/proc/$pid/environ\" || exit 20; "
        f"tr '\\000' '\\n' < \"/proc/$pid/environ\" | grep -Fxq -- {expected_env} || exit 21; "
        "kill -0 -- \"-$pid\" 2>/dev/null || exit 22; "
        "kill -TERM -- \"-$pid\" 2>/dev/null || exit 23; "
        "n=0; while kill -0 -- \"-$pid\" 2>/dev/null && [ \"$n\" -lt 30 ]; "
        "do sleep 0.1; n=$((n+1)); done; "
        "if kill -0 -- \"-$pid\" 2>/dev/null; then kill -KILL -- \"-$pid\" 2>/dev/null || exit 24; fi; "
        "n=0; while kill -0 -- \"-$pid\" 2>/dev/null && [ \"$n\" -lt 20 ]; "
        "do sleep 0.1; n=$((n+1)); done; "
        "! kill -0 -- \"-$pid\" 2>/dev/null"
    )
    try:
        # Use o mesmo UID do processo alvo: kernels com ptrace/Yama restritivo
        # podem negar ate a root sem CAP_SYS_PTRACE a leitura de /proc/$pid/environ.
        # O nonce no environ e o PID persistido limitam estritamente qual grupo
        # pode ser sinalizado.
        completed = subprocess.run(
            [
                "docker", "exec", "--user", OPENCLAW_RUNTIME_USER,
                OPENCLAW_CONTAINER, "bash", "-c", script,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    if completed.returncode != 0:
        return False
    for suffix in ("pid", "exit"):
        try:
            _runtime_file(run_id, suffix).unlink(missing_ok=True)
        except OSError:
            pass
    try:
        _runtime_file(run_id, "stopped").write_text(
            f"{int(time.time())}\n", encoding="utf-8",
        )
    except OSError:
        return False
    return True


def create_run(stage_id: str, submitted_by: str = "admin-ui", dry_run: Optional[bool] = None) -> dict:
    """Cria registro de run e spawna subprocess docker exec.

    Raises:
        ValueError: stage desconhecido.
        DuplicateRunError: já existe run ativo do mesmo stage.
    """
    if stage_id not in PIPELINE_STAGES:
        raise ValueError(f"etapa desconhecida: {stage_id}")
    stage = PIPELINE_STAGES[stage_id]
    # Action-time preflight is deep and fail-closed: imports and the real CDP
    # endpoint must be healthy before reserving a mutating run.
    preflight = get_stage_preflight(stage_id, deep=True)
    if (
        not preflight.get("can_run")
        and _preflight_is_browser_cdp_only_blocker(preflight)
        and _recover_browser_cdp()
    ):
        # Re-evaluate every requirement and artifact after recovery; a browser
        # restart must never bypass an unrelated blocker discovered meanwhile.
        preflight = get_stage_preflight(stage_id, deep=True)
    if not preflight.get("can_run"):
        blockers = ", ".join(c.get("detail") or c.get("label") or c.get("id") for c in preflight.get("blockers", []))
        raise ValueError(f"etapa indisponível: {stage_id} ({blockers})")
    run_id = str(uuid.uuid4())
    cmd_parts, effective_dry_run = build_stage_docker_command(
        stage_id, dry_run, run_id=run_id,
    )
    started_at = int(time.time())
    log_path = PIPELINE_LOG_DIR / f"{run_id}.log"
    command_message = (
        f"cmd: {shlex.join(cmd_parts)}; "
        f"dry_run={str(effective_dry_run).lower()}"
    )

    # Reserva globalmente o slot antes do spawn. Todos os stages compartilham
    # artefatos no workspace, entao all+publish/format/curator tambem conflitam.
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            """SELECT id, stage FROM runs
               WHERE status IN ('running','pending','stopping')
               ORDER BY started_at DESC LIMIT 1""",
        ).fetchone()
        if existing:
            conn.rollback()
            raise DuplicateRunError(existing["id"], stage_id, existing["stage"])
        conn.execute(
            """INSERT INTO runs
               (id, stage, status, started_at, log_path, pid, submitted_by, message, dry_run)
               VALUES (?, ?, 'pending', ?, ?, NULL, ?, ?, ?)""",
            (
                run_id, stage_id, started_at, str(log_path), submitted_by,
                command_message, 1 if effective_dry_run else 0,
            ),
        )
        conn.commit()
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()

    proc: Optional[subprocess.Popen] = None
    log_fp = None
    try:
        log_fp = open(log_path, "ab", buffering=0)
        proc = subprocess.Popen(
            cmd_parts,
            cwd=str(PIPELINE_LOG_DIR),
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
        log_fp.close()
        log_fp = None

        # A reserva pending ja existe; associe o cliente docker atomically.
        # Se esta escrita falhar, o wrapper interno e encerrado por nonce/PGID.
        _activate_reserved_run(run_id, proc.pid)

        # So exponha o handle depois que o banco confirma o estado running.
        _RUN_HANDLES[run_id] = proc
    except Exception as exc:
        if log_fp is not None:
            log_fp.close()
        termination_verified = proc is None
        if proc is not None:
            termination_verified = _terminate_tracked_container_run(run_id)
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        _RUN_HANDLES.pop(run_id, None)
        recovered_exit = None if termination_verified else _reconciled_exit_code(run_id)
        try:
            conn = _db()
            try:
                if termination_verified:
                    conn.execute(
                        """UPDATE runs
                           SET status = 'failed', finished_at = ?, exit_code = NULL,
                               message = ?
                           WHERE id = ? AND status IN ('pending','running')""",
                        (
                            int(time.time()),
                            f"start_failed: {type(exc).__name__}: {str(exc)[:300]}",
                            run_id,
                        ),
                    )
                else:
                    conn.execute(
                        """UPDATE runs SET message = ?
                           WHERE id = ? AND status IN ('pending','running','stopping')""",
                        (
                            f"start_unverified: {type(exc).__name__}: {str(exc)[:300]}",
                            run_id,
                        ),
                    )
                conn.commit()
            finally:
                conn.close()
        except Exception as persist_exc:
            print(
                f"[cadu-pipeline] falha ao persistir erro de inicialização de {run_id}: {persist_exc}",
                flush=True,
            )
        if recovered_exit is not None:
            _finalize_run(run_id, exit_code=recovered_exit)
        elif termination_verified:
            # Se stop_run venceu a corrida, preserve a precedencia cancelled.
            cancelled = _finalize_run(
                run_id, exit_code=-15, cancellation_verified=True,
            )
            if not cancelled:
                _cleanup_runtime_files(run_id)
        raise

    # Cleanup histórico (mantém últimos N)
    _cleanup_old_runs()

    return {
        "run_id": run_id,
        "stage": stage_id,
        "started_at": started_at,
        "pid": proc.pid,
        "log_path": str(log_path),
        "estimated_sec": stage.estimated_sec,
        "dry_run": effective_dry_run,
    }


def _unlink_pruned_run_log(run_id: str, path_value: str) -> bool:
    """Remove somente o log canônico que já ficou órfão após prune do SQLite."""
    try:
        log_path = managed_run_log_path(run_id, path_value, must_exist=True)
        log_path.unlink()
        return True
    except (FileNotFoundError, OSError, ValueError):
        return False


def _cleanup_orphan_logs(now: Optional[float] = None) -> int:
    """Remove UUID.log antigos sem registro, preservando logs auxiliares/duvidosos."""
    current_time = float(now if now is not None else time.time())
    conn = _db()
    try:
        referenced_ids = {str(row[0]).lower() for row in conn.execute("SELECT id FROM runs")}
    finally:
        conn.close()

    removed = 0
    try:
        candidates = list(PIPELINE_LOG_DIR.glob("*.log"))
    except OSError:
        return 0
    for candidate in candidates:
        try:
            run_id = _validated_run_id(candidate.stem)
        except ValueError:
            # git-sync.log e qualquer nome não canônico nunca pertencem ao prune.
            continue
        if run_id in referenced_ids:
            continue
        try:
            info = candidate.lstat()
            if current_time - info.st_mtime < PIPELINE_ORPHAN_LOG_GRACE_SEC:
                continue
            managed = managed_run_log_path(run_id, str(candidate), must_exist=True)
            managed.unlink()
            removed += 1
        except (FileNotFoundError, OSError, ValueError):
            continue
    return removed


def _cleanup_old_runs() -> None:
    """Mantém histórico limitado e remove apenas logs canônicos já órfãos."""
    pruned: list[tuple[str, str]] = []
    try:
        conn = _db()
        try:
            rows = conn.execute(
                """SELECT id, log_path FROM runs
                   WHERE id NOT IN (
                       SELECT id FROM runs ORDER BY started_at DESC LIMIT ?
                   )
                     AND status NOT IN ('pending', 'running', 'stopping')""",
                (PIPELINE_MAX_HISTORY,),
            ).fetchall()
            pruned = [(str(row["id"]), str(row["log_path"])) for row in rows]
            conn.executemany("DELETE FROM runs WHERE id = ?", [(run_id,) for run_id, _ in pruned])
            conn.commit()
        finally:
            conn.close()
        for run_id, log_path in pruned:
            _unlink_pruned_run_log(run_id, log_path)
        _cleanup_orphan_logs()
    except Exception as e:
        print(f"[cadu-pipeline] falha na limpeza: {e}", flush=True)


# Também reconcilia retenção no startup; um restart não precisa esperar a
# próxima submissão para remover rows/logs antigos. A graça protege arquivos
# recém-criados e o validador ignora qualquer nome/path não gerenciado.
_cleanup_old_runs()


def get_run(run_id: str) -> Optional[dict]:
    """Retorna info do run. Atualiza status automaticamente se processo terminou."""
    conn = _db()
    try:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    run = dict(row)

    finalized = False
    if run["status"] in ACTIVE_RUN_STATUSES:
        proc = _RUN_HANDLES.get(run_id)
        if proc is not None:
            cli_exit = proc.poll()
            if cli_exit is not None:
                if run["status"] != "stopping":
                    reconciled_exit = _reconciled_exit_code(run_id, cli_exit)
                    if reconciled_exit is not None:
                        finalized = _finalize_run(run_id, exit_code=reconciled_exit)
                _RUN_HANDLES.pop(run_id, None)
        else:
            # Depois de restart, o wrapper interno persiste o exit code. Sem
            # essa prova, mantenha running: marcar failed liberaria outro run
            # enquanto o processo antigo talvez ainda esteja mutando dados.
            recovered_exit = _reconciled_exit_code(run_id)
            if recovered_exit is not None:
                finalized = _finalize_run(run_id, exit_code=recovered_exit)
            elif run["status"] == "pending":
                runtime_pid = _read_runtime_int(run_id, "pid")
                if runtime_pid is not None:
                    conn = _db()
                    try:
                        conn.execute(
                            """UPDATE runs SET status = 'running', pid = ?
                               WHERE id = ? AND status = 'pending'""",
                            (runtime_pid, run_id),
                        )
                        conn.commit()
                    finally:
                        conn.close()
                    run["status"] = "running"
                    run["pid"] = runtime_pid
                elif int(time.time()) - run.get("started_at", 0) > 60:
                    # O wrapper grava PID antes de executar Node. Sem PID/exit
                    # apos o grace period, nenhum child mutante foi iniciado.
                    finalized = _finalize_run(run_id, exit_code=None)

    if finalized:
        conn = _db()
        try:
            refreshed = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        finally:
            conn.close()
        if refreshed:
            run = dict(refreshed)

    return _with_effective_outcome(run)


def list_runs(limit: int = 20) -> list[dict]:
    conn = _db()
    try:
        rows = conn.execute(
            "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?", (limit,),
        ).fetchall()
    finally:
        conn.close()
    return [_with_effective_outcome(dict(r)) for r in rows]


def _run_outcome_status(run: Optional[dict]) -> Optional[str]:
    if not run:
        return None
    summary = run.get("summary") or {}
    outcome = run.get("outcome") or summary.get("outcome") or {}
    status = outcome.get("status")
    return status if status in VALID_OUTCOME_STATUSES else None


def get_pipeline_health(now: Optional[int] = None) -> dict:
    """Resumo operacional para watchdog/UI sem disparar qualquer automacao."""
    checked_at = int(now or time.time())
    window_start = checked_at - PIPELINE_HEALTH_FAILURE_WINDOW_SEC
    conn = _db()
    try:
        active_row = conn.execute(
            """SELECT * FROM runs WHERE status IN ('pending','running','stopping')
               ORDER BY started_at DESC LIMIT 1"""
        ).fetchone()
        latest_row = conn.execute(
            "SELECT * FROM runs WHERE dry_run = 0 ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        latest_all_row = conn.execute(
            "SELECT * FROM runs WHERE stage = 'all' AND dry_run = 0 ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        last_success_rows = conn.execute(
            """SELECT * FROM runs
               WHERE stage = 'all' AND dry_run = 0
                 AND status = 'finished' AND exit_code = 0
               ORDER BY COALESCE(finished_at, started_at) DESC LIMIT ?""",
            (PIPELINE_MAX_HISTORY,),
        ).fetchall()
        failure_rows = conn.execute(
            """SELECT * FROM runs
               WHERE dry_run = 0 AND status = 'failed' AND started_at >= ?
               ORDER BY started_at DESC LIMIT ?""",
            (window_start, PIPELINE_MAX_HISTORY),
        ).fetchall()
        recent_completed_rows = conn.execute(
            """SELECT * FROM runs
               WHERE dry_run = 0 AND status IN ('finished', 'failed') AND started_at >= ?
               ORDER BY started_at DESC LIMIT ?""",
            (window_start, PIPELINE_MAX_HISTORY),
        ).fetchall()
        count_rows = conn.execute(
            """SELECT status, COUNT(*) AS count FROM runs
               WHERE dry_run = 0 AND started_at >= ?
               GROUP BY status""",
            (window_start,),
        ).fetchall()
    finally:
        conn.close()

    summary_cache: dict[str, dict] = {}

    def enrich(row) -> Optional[dict]:
        if not row:
            return None
        run = dict(row)
        run_id = str(run.get("id") or "")
        if run_id not in summary_cache:
            # Health is consumed directly by both the watchdog and the admin
            # page.  A wrapper exit 0 is not proof that every required child
            # stage succeeded, so expose the reconciled outcome here too.
            summary_cache[run_id] = _with_effective_outcome(run)
        return summary_cache[run_id]

    active = enrich(active_row)
    latest = enrich(latest_row)
    latest_all = enrich(latest_all_row)
    # Pare no primeiro sucesso valido. Materializar todos os candidatos relia
    # dezenas de logs grandes e chegou a monopolizar o worker do cadu-api.
    last_success = None
    for row in last_success_rows:
        candidate = enrich(row)
        if _run_outcome_status(candidate) in (None, "success"):
            last_success = candidate
            break
    recent_completed = [enrich(r) for r in recent_completed_rows]
    failures_by_id = {
        run["id"]: run for run in (enrich(r) for r in failure_rows)
    }
    for run in recent_completed:
        if _run_outcome_status(run) == "failed":
            failures_by_id[run["id"]] = run
    failures = sorted(
        failures_by_id.values(),
        key=lambda run: run.get("started_at") or 0,
        reverse=True,
    )[:10]
    partial_runs = [run for run in recent_completed if _run_outcome_status(run) == "partial"]
    outcome_counts: dict[str, int] = {}
    for run in recent_completed:
        outcome_status = _run_outcome_status(run)
        if outcome_status:
            outcome_counts[outcome_status] = outcome_counts.get(outcome_status, 0) + 1
    recent_counts = {r["status"]: r["count"] for r in count_rows}

    issues: list[str] = []
    level = "ok"
    seconds_since_successful_all: Optional[int] = None

    if last_success:
        finished_at = last_success.get("finished_at") or last_success.get("started_at") or checked_at
        seconds_since_successful_all = max(0, checked_at - int(finished_at))
        if seconds_since_successful_all >= PIPELINE_HEALTH_CRITICAL_AFTER_SEC:
            level = "critical"
            issues.append("última execução completa bem-sucedida ultrapassou o limite crítico")
        elif seconds_since_successful_all >= PIPELINE_HEALTH_WARN_AFTER_SEC:
            level = "warning"
            issues.append("última execução completa bem-sucedida está atrasada")
    else:
        level = "warning"
        issues.append("nenhuma execução completa bem-sucedida foi registrada")

    if failures:
        if level == "ok":
            level = "warning"
        issues.append(f"{len(failures)} falha(s) nas últimas {PIPELINE_HEALTH_FAILURE_WINDOW_SEC // 3600} h")

    if partial_runs:
        if level == "ok":
            level = "warning"
        partial_label = "execução parcial" if len(partial_runs) == 1 else "execuções parciais"
        issues.append(f"{len(partial_runs)} {partial_label} nas últimas {PIPELINE_HEALTH_FAILURE_WINDOW_SEC // 3600} h")

    latest_outcome = _run_outcome_status(latest)
    if latest and (latest.get("status") == "failed" or latest_outcome == "failed"):
        if latest.get("stage") == "all":
            level = "critical"
        elif level == "ok":
            level = "warning"
        issues.append(f"última execução terminou com falha ({latest.get('stage')})")
    elif latest and latest_outcome == "partial":
        if level == "ok":
            level = "warning"
        issues.append(f"última execução terminou parcialmente ({latest.get('stage')})")

    status = "running" if active else level
    if not issues:
        issues.append("pipeline sem falhas recentes dentro dos limites configurados")

    recommendation = "nenhuma ação imediata"
    if level == "critical":
        recommendation = "verificar os logs da última execução e repetir a pipeline completa após a correção"
    elif level == "warning":
        recommendation = "acompanhar a próxima execução e conferir o agendador/cron"
    elif active:
        recommendation = "aguardar a execução ativa terminar"

    return {
        "ok": level == "ok",
        "scope": "real_runs_only",
        "dry_runs_excluded": True,
        "status": status,
        "level": level,
        "checked_at": checked_at,
        "thresholds": {
            "warn_after_sec": PIPELINE_HEALTH_WARN_AFTER_SEC,
            "critical_after_sec": PIPELINE_HEALTH_CRITICAL_AFTER_SEC,
            "failure_window_sec": PIPELINE_HEALTH_FAILURE_WINDOW_SEC,
        },
        "active_run": active,
        "latest_run": latest,
        "latest_all_run": latest_all,
        "last_successful_all_run": last_success,
        "seconds_since_successful_all": seconds_since_successful_all,
        "failures_recent_count": len(failures),
        "failures_recent": failures,
        "partial_runs_recent_count": len(partial_runs),
        "partial_runs_recent": partial_runs[:10],
        "recent_counts": recent_counts,
        "outcome_counts": outcome_counts,
        "outcome_runs_analyzed": len(recent_completed),
        "history_retention_limit": PIPELINE_MAX_HISTORY,
        "issues": issues,
        "recommendation": recommendation,
    }


def _finalize_run(
    run_id: str,
    exit_code: Optional[int],
    *,
    cancellation_verified: bool = False,
) -> bool:
    """Finaliza via CAS sem confundir exit natural com cancelamento solicitado."""
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT status FROM runs WHERE id = ?", (run_id,)).fetchone()
        if not row or row["status"] not in ACTIVE_RUN_STATUSES:
            conn.rollback()
            return False
        if cancellation_verified:
            if row["status"] != "stopping":
                conn.rollback()
                return False
            status = "cancelled"
            final_exit_code = -15
        elif exit_code is None:
            status = "failed"
            final_exit_code = None
        elif exit_code == 0:
            status = "finished"
            final_exit_code = 0
        elif exit_code in (-15, -9) and row["status"] == "stopping":
            status = "cancelled"
            final_exit_code = exit_code
        else:
            status = "failed"
            final_exit_code = exit_code
        cursor = conn.execute(
            """UPDATE runs SET status = ?, finished_at = ?, exit_code = ?
               WHERE id = ? AND status = ?""",
            (status, int(time.time()), final_exit_code, run_id, row["status"]),
        )
        conn.commit()
        finalized = cursor.rowcount == 1
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()
    if finalized and final_exit_code is not None:
        _cleanup_runtime_files(run_id)
    return finalized


def stop_run(run_id: str) -> bool:
    """Termina o grupo interno rastreado; nunca confirma apenas pelo Popen local."""
    proc = _RUN_HANDLES.get(run_id)
    try:
        completed_before_stop = _reconciled_exit_code(run_id)
    except ValueError:
        return False
    if completed_before_stop is not None:
        _finalize_run(run_id, exit_code=completed_before_stop)
        _RUN_HANDLES.pop(run_id, None)
        return False
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        if not row or row["status"] not in ACTIVE_RUN_STATUSES:
            conn.rollback()
            return False
        if row["status"] != "stopping":
            cursor = conn.execute(
                """UPDATE runs SET status = 'stopping'
                   WHERE id = ? AND status = ?""",
                (run_id, row["status"]),
            )
            if cursor.rowcount != 1:
                conn.rollback()
                return False
        conn.commit()
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        conn.close()

    if not _terminate_tracked_container_run(run_id):
        # Se ja terminou, reconcilie o exit persistido, mas nao afirme cancelamento.
        recovered_exit = _reconciled_exit_code(run_id)
        if recovered_exit is not None:
            _finalize_run(run_id, exit_code=recovered_exit)
            _RUN_HANDLES.pop(run_id, None)
        elif _read_runtime_int(run_id, "stopped") is not None:
            finalized = _finalize_run(
                run_id, exit_code=-15, cancellation_verified=True,
            )
            _RUN_HANDLES.pop(run_id, None)
            return finalized
        elif _runtime_lock_is_free() is True:
            late_exit = _reconciled_exit_code(run_id)
            _finalize_run(run_id, exit_code=late_exit)
            _cleanup_runtime_files(run_id)
            _RUN_HANDLES.pop(run_id, None)
        return False

    if proc is not None:
        try:
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                # O grupo interno ja foi comprovadamente encerrado; finalize
                # apenas o cliente docker local que ainda nao percebeu EOF.
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=2)
        except Exception as e:
            print(f"[cadu-pipeline] falha ao interromper a execução: {e}", flush=True)

    finalized = _finalize_run(run_id, exit_code=-15, cancellation_verified=True)
    _RUN_HANDLES.pop(run_id, None)
    if finalized:
        return True
    conn = _db()
    try:
        current = conn.execute("SELECT status FROM runs WHERE id = ?", (run_id,)).fetchone()
    finally:
        conn.close()
    return bool(current and current["status"] == "cancelled")


# ---------- Background loop (polling Popen handles) ----------

async def _reaper_loop() -> None:
    """
    Background task: detecta runs 'running' cujo Popen terminou.
    Substitui o antigo reap_zombies (que usava os.kill(pid, 0) — quebrado
    em ambientes com namespaces isolados).
    """
    while True:
        try:
            # Itera snapshot dos handles (não pode modificar dict durante iteração)
            run_ids = list(_RUN_HANDLES.keys())
            for run_id in run_ids:
                proc = _RUN_HANDLES.get(run_id)
                if proc is None:
                    continue
                conn = _db()
                try:
                    current = conn.execute(
                        "SELECT status FROM runs WHERE id = ?", (run_id,),
                    ).fetchone()
                finally:
                    conn.close()
                if current and current["status"] == "stopping":
                    # stop_run may have failed transiently after changing the
                    # durable state to stopping. Retry the verified in-container
                    # group termination off the event loop even while the local
                    # Docker client remains alive; otherwise this handle would
                    # block single-flight forever.
                    await asyncio.to_thread(stop_run, run_id)
                    continue
                cli_exit = proc.poll()
                if cli_exit is not None:
                    reconciled_exit = None
                    if current and current["status"] != "stopping":
                        reconciled_exit = _reconciled_exit_code(run_id, cli_exit)
                        if reconciled_exit is not None:
                            _finalize_run(run_id, exit_code=reconciled_exit)
                    _RUN_HANDLES.pop(run_id, None)
                    print(
                        f"[cadu-pipeline] reaper: cliente Docker da execução {run_id[:8]} "
                        f"encerrou (cli_exit={cli_exit}, reconciliado={reconciled_exit})",
                        flush=True,
                    )
                else:
                    # Docker client still open, but the in-container group may
                    # already be gone (lost handle / stuck docker exec). If the
                    # shared runtime lock is free, reconcile instead of blocking
                    # single-flight forever while the UI shows "em execução".
                    conn = _db()
                    try:
                        row = conn.execute(
                            "SELECT stage, started_at FROM runs WHERE id = ?",
                            (run_id,),
                        ).fetchone()
                    finally:
                        conn.close()
                    if row:
                        age = int(time.time()) - (row["started_at"] or 0)
                        stage = PIPELINE_STAGES.get(row["stage"])
                        deadline = stage_max_runtime_sec(stage, row["stage"])
                        lock_free = _runtime_lock_is_free()
                        recovered_exit = _reconciled_exit_code(run_id)
                        if recovered_exit is not None and lock_free is True:
                            _finalize_run(run_id, exit_code=recovered_exit)
                            _RUN_HANDLES.pop(run_id, None)
                            try:
                                proc.terminate()
                            except Exception:
                                pass
                            print(
                                f"[cadu-pipeline] reaper: handle vivo mas processo "
                                f"interno de {run_id[:8]} já terminou "
                                f"(exit={recovered_exit}) -> finalizado",
                                flush=True,
                            )
                        elif age > 60 and lock_free is True:
                            _finalize_run(run_id, exit_code=None)
                            _cleanup_runtime_files(run_id)
                            _RUN_HANDLES.pop(run_id, None)
                            try:
                                proc.terminate()
                            except Exception:
                                pass
                            print(
                                f"[cadu-pipeline] reaper: handle zombie {run_id[:8]} "
                                "sem bloqueio de runtime -> falha",
                                flush=True,
                            )
                        elif age > deadline:
                            terminated = await asyncio.to_thread(
                                _terminate_tracked_container_run, run_id,
                            )
                            if terminated or lock_free is True:
                                _finalize_run(run_id, exit_code=None)
                                _cleanup_runtime_files(run_id)
                                _RUN_HANDLES.pop(run_id, None)
                                try:
                                    proc.terminate()
                                except Exception:
                                    pass
                                print(
                                    f"[cadu-pipeline] reaper: handle {run_id[:8]} "
                                    f"excedeu max_runtime={deadline}s -> falha",
                                    flush=True,
                                )

            # Reconciliacao apos restart: o wrapper interno persiste PID e exit.
            # Nunca libere o single-flight apenas pela idade de um processo.
            try:
                conn = _db()
                try:
                    orphans = conn.execute(
                        """SELECT id, stage, status, started_at FROM runs
                           WHERE status IN ('pending','running','stopping')"""
                    ).fetchall()
                finally:
                    conn.close()
                now = int(time.time())
                for orph in orphans:
                    rid = orph["id"]
                    if rid in _RUN_HANDLES:
                        continue
                    age = now - (orph["started_at"] or 0)
                    recovered_exit = _reconciled_exit_code(rid)
                    if recovered_exit is not None:
                        _finalize_run(rid, exit_code=recovered_exit)
                        print(
                            f"[cadu-pipeline] reaper: execução {rid[:8]} reconciliada "
                            f"(exit={recovered_exit})",
                            flush=True,
                        )
                        continue
                    runtime_pid = _read_runtime_int(rid, "pid")
                    if orph["status"] == "pending":
                        if runtime_pid is not None:
                            conn = _db()
                            try:
                                conn.execute(
                                    """UPDATE runs SET status = 'running', pid = ?
                                       WHERE id = ? AND status = 'pending'""",
                                    (runtime_pid, rid),
                                )
                                conn.commit()
                            finally:
                                conn.close()
                            continue
                        if age > 60:
                            _finalize_run(rid, exit_code=None)
                            print(
                                f"[cadu-pipeline] reaper: reserva pendente {rid[:8]} "
                                "sem processo iniciado -> falha",
                                flush=True,
                            )
                        continue
                    if orph["status"] == "stopping":
                        if _read_runtime_int(rid, "stopped") is not None:
                            _finalize_run(
                                rid, exit_code=-15, cancellation_verified=True,
                            )
                            continue
                        terminated = await asyncio.to_thread(
                            _terminate_tracked_container_run, rid,
                        )
                        if terminated:
                            _finalize_run(
                                rid, exit_code=-15, cancellation_verified=True,
                            )
                        elif _runtime_lock_is_free() is True:
                            # Releia o marcador depois de provar ausencia; ele
                            # pode ter sido gravado durante a tentativa de stop.
                            late_exit = _reconciled_exit_code(rid)
                            _finalize_run(rid, exit_code=late_exit)
                            _cleanup_runtime_files(rid)
                        continue
                    stage = PIPELINE_STAGES.get(orph["stage"])
                    # Fatal ceiling is independent of UI estimated_sec.
                    deadline = stage_max_runtime_sec(stage, orph["stage"])
                    if age > 60 and _runtime_lock_is_free() is True:
                        _finalize_run(rid, exit_code=None)
                        _cleanup_runtime_files(rid)
                        print(
                            f"[cadu-pipeline] reaper: execução obsoleta {rid[:8]} "
                            "sem bloqueio ativo -> falha",
                            flush=True,
                        )
                        continue
                    if age > deadline and await asyncio.to_thread(
                        _terminate_tracked_container_run, rid,
                    ):
                        _finalize_run(rid, exit_code=None)
                        _cleanup_runtime_files(rid)
                        print(
                            f"[cadu-pipeline] reaper: execução {rid[:8]} excedeu "
                            f"max_runtime={deadline}s, foi encerrada e marcada como falha",
                            flush=True,
                        )
            except Exception as e:
                print(f"[cadu-pipeline] falha ao reconciliar execuções órfãs: {e}", flush=True)

        except Exception as e:
            print(f"[cadu-pipeline] falha do reconciliador de execuções: {e}", flush=True)
        await asyncio.sleep(2)


# ---------- Log streaming (SSE) ----------

class _BoundedSSELineBuffer:
    """Converte chunks em linhas sem permitir crescimento por linha sem newline."""

    def __init__(self, *, prefix_omitted: bool = False):
        self._partial = bytearray()
        self._prefix_omitted = prefix_omitted
        self._overflow = False

    def _append(self, segment: bytes) -> None:
        available = PIPELINE_SSE_MAX_LINE_BYTES - len(self._partial)
        if available > 0:
            self._partial.extend(segment[:available])
        if len(segment) > max(available, 0):
            self._overflow = True

    def _finish_line(self) -> str:
        raw = bytes(self._partial).rstrip(b"\r")
        text = raw.decode("utf-8", errors="replace")
        if self._prefix_omitted:
            text = "[início da linha omitido] " + text
        if self._overflow:
            text += " ...[linha truncada]"
        self._partial.clear()
        self._prefix_omitted = False
        self._overflow = False
        return text

    def feed(self, chunk: bytes) -> list[str]:
        parts = chunk.split(b"\n")
        completed: list[str] = []
        for segment in parts[:-1]:
            self._append(segment)
            completed.append(self._finish_line())
        self._append(parts[-1])
        return completed

    def flush(self) -> list[str]:
        if not self._partial and not self._prefix_omitted and not self._overflow:
            return []
        return [self._finish_line()]


async def stream_log(run_id: str, follow: bool = True):
    """SSE limitado globalmente; fechamento/cancelamento sempre libera o slot."""
    if not _try_acquire_sse_slot():
        yield (
            "event: error\n"
            f"data: {json.dumps({'message': 'limite de conexões de streaming atingido', 'retryable': True}, ensure_ascii=False)}\n\n"
        )
        return
    try:
        async for event in _stream_log_acquired(run_id, follow=follow):
            yield event
    finally:
        _release_sse_slot()


async def _stream_log_acquired(run_id: str, follow: bool = True):
    """
    Async generator que yield eventos SSE com linhas do log.
    Se follow=True (default), continua até o processo terminar.

    Inclui heartbeat SSE (":keepalive\\n\\n") a cada SSE_HEARTBEAT_SEC pra
    evitar que proxies (Cloudflare, nginx, Traefik) fechem a conexão por
    inatividade.
    """
    conn = _db()
    try:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        yield f"event: error\ndata: {json.dumps({'message': 'execução não encontrada'}, ensure_ascii=False)}\n\n"
        return
    run = dict(row)
    try:
        log_path = managed_run_log_path(run_id, run["log_path"], must_exist=True)
    except (FileNotFoundError, ValueError):
        yield f"event: error\ndata: {json.dumps({'message': 'arquivo de log ausente'}, ensure_ascii=False)}\n\n"
        return

    # Envia snapshot inicial: status atual
    yield f"event: status\ndata: {json.dumps({'status': run['status'], 'started_at': run['started_at'], 'dry_run': bool(run.get('dry_run', False))})}\n\n"

    try:
        initial_size = log_path.stat().st_size
    except OSError:
        yield f"event: error\ndata: {json.dumps({'message': 'o arquivo de log desapareceu'}, ensure_ascii=False)}\n\n"
        return

    # O primeiro cliente recebe no máximo o backlog configurado. Leituras
    # posteriores avançam em chunks e nunca materializam ``size - pos``.
    pos = max(0, initial_size - PIPELINE_SSE_INITIAL_BACKLOG_BYTES)
    snapshot_end = initial_size if not follow else None
    line_buffer = _BoundedSSELineBuffer(prefix_omitted=pos > 0)
    pending_lines: deque[str] = deque()
    terminal_payload: Optional[dict] = None
    last_status_check = 0
    last_heartbeat = time.time()
    while True:
        if pending_lines:
            for _ in range(min(len(pending_lines), PIPELINE_SSE_MAX_LINES_PER_TICK)):
                line = pending_lines.popleft()
                yield f"event: log\ndata: {json.dumps({'line': line}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0)
            continue
        if (
            terminal_payload is not None
            and snapshot_end is not None
            and pos >= snapshot_end
        ):
            pending_lines.extend(line_buffer.flush())
            if pending_lines:
                continue
            yield f"event: done\ndata: {json.dumps(terminal_payload)}\n\n"
            return

        try:
            size = log_path.stat().st_size
        except OSError:
            yield f"event: error\ndata: {json.dumps({'message': 'o arquivo de log desapareceu'}, ensure_ascii=False)}\n\n"
            return

        if size < pos:
            pos = max(0, size - PIPELINE_SSE_INITIAL_BACKLOG_BYTES)
            line_buffer = _BoundedSSELineBuffer(prefix_omitted=pos > 0)
        read_end = size if snapshot_end is None else min(size, snapshot_end)
        if read_end > pos:
            take = min(read_end - pos, PIPELINE_SSE_READ_CHUNK_BYTES)
            with open(log_path, "rb") as f:
                f.seek(pos)
                chunk = f.read(take)
            if chunk:
                pos += len(chunk)
                pending_lines.extend(line_buffer.feed(chunk))
                if pending_lines:
                    continue

        # Verifica status a cada 1s
        now = time.time()
        if now - last_status_check > 1:
            last_status_check = now
            cur = get_run(run_id)
            if cur and cur["status"] not in ACTIVE_RUN_STATUSES:
                terminal_payload = {
                    "status": cur["status"],
                    "effective_status": cur.get("effective_status") or cur["status"],
                    "outcome_status": cur.get("outcome_status"),
                    "outcome": cur.get("outcome"),
                    "steps": cur.get("steps") or [],
                    "dry_run": cur.get("dry_run", False),
                    "exit_code": cur["exit_code"],
                    "finished_at": cur["finished_at"],
                }
                snapshot_end = size
                if pos >= read_end:
                    pending_lines.extend(line_buffer.flush())
                if pending_lines:
                    continue
                yield f"event: done\ndata: {json.dumps(terminal_payload)}\n\n"
                return

        # Heartbeat SSE (evita timeout de proxies)
        if now - last_heartbeat > SSE_HEARTBEAT_SEC:
            last_heartbeat = now
            yield f":keepalive\n\n"

        if not follow:
            if pos < read_end:
                continue
            pending_lines.extend(line_buffer.flush())
            if pending_lines:
                continue
            return

        await asyncio.sleep(0.3)


# ---------- Listing helper ----------

def get_pipeline_status() -> dict:
    """Retorna catálogo + run ativo + histórico recente."""
    conn = _db()
    try:
        active_row = conn.execute(
            """SELECT * FROM runs WHERE status IN ('pending','running','stopping')
               ORDER BY started_at DESC LIMIT 1"""
        ).fetchone()
        history_rows = conn.execute(
            "SELECT * FROM runs ORDER BY started_at DESC LIMIT 20"
        ).fetchall()
    finally:
        conn.close()

    stages_info = []
    for sid, s in PIPELINE_STAGES.items():
        # último run desse stage
        conn = _db()
        try:
            last = conn.execute(
                "SELECT * FROM runs WHERE stage = ? ORDER BY started_at DESC LIMIT 1",
                (sid,),
            ).fetchone()
        finally:
            conn.close()
        last_run = _with_effective_outcome(dict(last)) if last else None
        preflight = get_stage_preflight(sid)
        stages_info.append({
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "script": s.script,
            "args": list(s.args),
            "estimated_sec": s.estimated_sec,
            "category": s.category,
            "last_run": last_run,
            "preflight": preflight,
        })

    return {
        "contract_version": "cadu-pipeline-control-v1",
        "runner": {"name": "cadu-api", "version": CADU_API_VERSION},
        "curator": {"name": "Curador UFG", "version": CURATOR_VERSION},
        "runner_version": CADU_API_VERSION,
        "curator_version": CURATOR_VERSION,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "capabilities": {
            "explicit_dry_run": True,
            "explicit_run_mode_routes": True,
        },
        "stages": stages_info,
        "active_run": _with_effective_outcome(dict(active_row)) if active_row else None,
        "history": [_with_effective_outcome(dict(r)) for r in history_rows],
        "health": get_pipeline_health(),
    }
