#!/bin/bash
# sync-vps-to-clone.sh - Sincroniza edicoes manuais do VPS scratch space para o clone git.
#
# CONTEXTO:
# Em 2026-07-25, o run 5101099a reportou "success" mas publicou so 17 de 47 candidatos.
# A causa raiz foi que o VPS scratch space (/docker/openclaw-hahq/data/.openclaw/workspace/scripts/)
# tinha ~490KB de codigo com Fixes A-P que NAO estava no clone git. Quando o git-sync.sh
# rodou em seguida, ele puxou do clone (sem os Fixes) e SOBRESCREVEU o scratch space.
#
# Este script detecta arquivos modificados no VPS scratch space (que esta montado como /data
# no container cadu-api) que diferem do clone, copia para o clone, e commita.
#
# USO:
#   bash scripts/sync-vps-to-clone.sh [--dry-run] [--no-commit]
#
# FLUXO:
#   1. Compara SHA256 de cada arquivo em $VPS_SCRIPTS vs $CLONE_SCRIPTS
#   2. Lista divergencias (vps-only, clone-only, different)
#   3. Se --dry-run: so lista. Senao: copia vps->clone dos divergentes
#   4. Se --no-commit: para aqui. Senao: git add + commit + push
#
# VARIAVEIS DE AMBIENTE:
#   VPS_SCRIPTS   path do scratch space (default: /docker/openclaw-hahq/data/.openclaw/workspace/scripts)
#   CLONE_SCRIPTS path do clone git (default: /docker/openclaw-hahq/releases/openclaw-cadu/data/.openclaw/workspace/scripts)
#   COMMIT_MSG    mensagem do commit (default: detectada via flag)

set -euo pipefail

VPS_SCRIPTS="${VPS_SCRIPTS:-/docker/openclaw-hahq/data/.openclaw/workspace/scripts}"
CLONE_SCRIPTS="${CLONE_SCRIPTS:-/docker/openclaw-hahq/releases/openclaw-cadu/data/.openclaw/workspace/scripts}"
VPS_API="${VPS_API:-/docker/openclaw-hahq/data/.openclaw/skills/cadu-api}"
CLONE_API="${CLONE_API:-/docker/openclaw-hahq/releases/openclaw-cadu/data/.openclaw/skills/cadu-api}"

DRY_RUN=0
NO_COMMIT=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-commit) NO_COMMIT=1 ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -d "$VPS_SCRIPTS" ]; then
  echo "ERROR: VPS_SCRIPTS not found: $VPS_SCRIPTS" >&2
  exit 1
fi
if [ ! -d "$CLONE_SCRIPTS" ]; then
  echo "ERROR: CLONE_SCRIPTS not found: $CLONE_SCRIPTS" >&2
  exit 1
fi

CLONE_DIR="$(cd "$CLONE_SCRIPTS/../.." && pwd -P)"

echo "=== Sync VPS scratch space -> openclaw-cadu clone ==="
echo "VPS:    $VPS_SCRIPTS"
echo "CLONE:  $CLONE_SCRIPTS"
echo "API:    $VPS_API -> $CLONE_API"
echo "DRY_RUN=$DRY_RUN NO_COMMIT=$NO_COMMIT"
echo

# 1. Listar arquivos rastreados no clone
cd "$CLONE_DIR"
TRACKED_FILES=$(git ls-files -z -- 'data/.openclaw/workspace/scripts' 'data/.openclaw/skills/cadu-api' 2>/dev/null | tr '\0' '\n' || true)

if [ -z "$TRACKED_FILES" ]; then
  echo "ERROR: no tracked files found in clone" >&2
  exit 1
fi

# 2. Para cada arquivo rastreado, comparar SHA256 VPS vs CLONE
DIVERGENT=()
SAME=0
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  if [[ "$rel" == data/.openclaw/workspace/scripts/* ]]; then
    vps="$VPS_SCRIPTS/${rel#data/.openclaw/workspace/scripts/}"
  elif [[ "$rel" == data/.openclaw/skills/cadu-api/* ]]; then
    vps="$VPS_API/${rel#data/.openclaw/skills/cadu-api/}"
  else
    continue
  fi
  clone="$CLONE_DIR/$rel"
  if [ ! -f "$vps" ]; then
    continue  # VPS nao tem o arquivo (raro; registrar)
  fi
  vps_hash=$(sha256sum "$vps" | awk '{print $1}')
  clone_hash=$(sha256sum "$clone" | awk '{print $1}')
  if [ "$vps_hash" = "$clone_hash" ]; then
    SAME=$((SAME + 1))
  else
    DIVERGENT+=("$rel")
  fi
done <<< "$TRACKED_FILES"

echo "=== Resultado ==="
echo "Iguais:    $SAME"
echo "Divergentes: ${#DIVERGENT[@]}"
if [ ${#DIVERGENT[@]} -gt 0 ]; then
  printf '  - %s\n' "${DIVERGENT[@]}"
fi
echo

if [ ${#DIVERGENT[@]} -eq 0 ]; then
  echo "Nada a sincronizar."
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY-RUN: nenhum arquivo copiado."
  exit 0
fi

# 3. Copiar VPS -> CLONE
for rel in "${DIVERGENT[@]}"; do
  if [[ "$rel" == data/.openclaw/workspace/scripts/* ]]; then
    src="$VPS_SCRIPTS/${rel#data/.openclaw/workspace/scripts/}"
  elif [[ "$rel" == data/.openclaw/skills/cadu-api/* ]]; then
    src="$VPS_API/${rel#data/.openclaw/skills/cadu-api/}"
  fi
  dst="$CLONE_DIR/$rel"
  echo "  + cp $rel"
  cp -a -- "$src" "$dst"
done
echo

# 4. Verificar encoding (BOM UTF-8 quebra Node 24)
BOM_FILES=()
for rel in "${DIVERGENT[@]}"; do
  if [[ "$rel" == *.js ]] || [[ "$rel" == *.py ]]; then
    first_bytes=$(head -c 3 "$CLONE_DIR/$rel" 2>/dev/null | od -An -tx1 | tr -d ' ' || true)
    if [ "$first_bytes" = "efbbbf" ]; then
      BOM_FILES+=("$rel")
    fi
  fi
done
if [ ${#BOM_FILES[@]} -gt 0 ]; then
  echo "WARN: arquivos com BOM UTF-8 detectado (quebra Node 24):"
  printf '  - %s\n' "${BOM_FILES[@]}"
  for f in "${BOM_FILES[@]}"; do
    sed -i '1s/^\xEF\xBB\xBF//' "$CLONE_DIR/$f"
    echo "  - BOM removido: $f"
  done
fi
echo

# 5. git status
git status --short --untracked-files=all | head -30
echo

if [ "$NO_COMMIT" = "1" ]; then
  echo "--no-commit: arquivos copiados mas NAO commitados."
  exit 0
fi

# 6. Commit
DEFAULT_MSG="fix(sync): sync VPS scratch space -> clone (manual fix recovery)"
COMMIT_MSG="${COMMIT_MSG:-$DEFAULT_MSG}"

git add -- 'data/.openclaw/workspace/scripts' 'data/.openclaw/skills/cadu-api'
git -c user.email="yan1nakamura@gmail.com" -c user.name="Yan Diamantino" commit -m "$COMMIT_MSG"

echo
echo "=== Commit criado. Review antes de push: ==="
git log -1 --stat
echo
echo "Para push:  git push origin main"
