@echo off
chcp 65001 >nul
title KinoCampus — Push + PR

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  KinoCampus — Push + Criar Pull Request      ║
echo  ╚══════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [1/3] Fazendo push do branch para o GitHub...
git push -u origin feat/audit-log-activity-tracking
if errorlevel 1 (
  echo.
  echo  ERRO: Push falhou. Verifique se o GitHub Desktop está logado.
  pause
  exit /b 1
)

echo.
echo [2/3] Criando Pull Request via GitHub CLI (gh)...

where gh >nul 2>&1
if errorlevel 1 (
  echo  GitHub CLI (gh) nao encontrado. Vou abrir o GitHub no navegador.
  echo  La voce clica em "Compare and pull request".
  start "" "https://github.com/yandiamantinoBr/kino-campus/compare/feat/audit-log-activity-tracking?expand=1"
  echo.
  echo [3/3] Pronto! Faca o merge la no GitHub quando quiser.
  pause
  exit /b 0
)

gh pr create ^
  --base kinocampus-V8.2-SANEAMENTO-QA ^
  --head feat/audit-log-activity-tracking ^
  --title "feat: audit log para post_created e comment_created" ^
  --body "## Resumo%%~nCorrige a ausência de registros no audit_log para ações de criação de post e de comentário, que alimentam as métricas do dashboard administrativo (Posts publicados / Comentários nos últimos 30 dias).%%~n%%~n**Mudanças:**%%~n- `kc-core.js` — `kcHandleCreateSubmit`: grava `action=post_created` após criação bem-sucedida (fire-and-forget)%%~n- `kc-core.js` — `submitComment`: grava `action=comment_created` após envio de comentário via Supabase%%~n%%~n## Como testar%%~n- [ ] Publicar um post e verificar nova linha no audit_log%%~n- [ ] Comentar em um post e verificar nova linha no audit_log%%~n- [ ] Acessar dashboard admin e confirmar métricas de atividade%%~n%%~n🤖 Generated with [Claude Code](https://claude.com/claude-code)"

if errorlevel 1 (
  echo.
  echo  PR nao criado via gh. Abrindo GitHub no navegador...
  start "" "https://github.com/yandiamantinoBr/kino-campus/compare/kinocampus-V8.2-SANEAMENTO-QA...feat/audit-log-activity-tracking?expand=1"
)

echo.
echo [3/3] Tudo pronto! Faca o merge no GitHub quando quiser.
echo.
pause
