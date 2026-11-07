#!/usr/bin/env bash
# O comentário do preview no PR: um só por PR (achado pelo marcador), atualizado a cada evento.
#
# Uso: preview-comment.sh <estado> [arg]
#   deployed <url>       publicado (cria ou atualiza)
#   skipped <faltando>   faltam secrets, nada publicado (cria ou atualiza)
#   closed               PR fechado; usa WORKER_STATE e DATABASE_STATE (removed|absent) de
#                        delete-preview.sh. Só atualiza um comentário que já existe.
#   closed-missing <faltando>
#                        PR fechado sem os secrets para apagar o preview. Só atualiza um
#                        comentário de preview publicado (é quando pode ter sobrado algo).
#   env GH_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, WORKER, NEON_BRANCH; HEAD_SHA (deployed)
#
# Uma falha da API do GitHub vira um aviso (o preview em si não depende do comentário).
set -euo pipefail

state="${1:?uso: preview-comment.sh <deployed|skipped|closed|closed-missing> [arg]}"
arg="${2:-}"
: "${GITHUB_REPOSITORY:?}" "${PR_NUMBER:?}"
worker="${WORKER:-}"
sha="${HEAD_SHA:-}"
branch="${NEON_BRANCH:-preview/pr-$PR_NUMBER}"
marker="<!-- elfo-preview -->"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

connect="No [Elfo](https://elfo.dev), abra o board deste repositório → **Settings → Deploy** e conecte a Cloudflare e o Neon"
# Cada nome entre crases (Markdown).
# shellcheck disable=SC2016
codes() { sed -E 's/([A-Z0-9_]+)/`\1`/g' <<<"$1"; }

case "$state" in
  deployed)
    text="### 🔎 Preview deste PR

**${arg:?url}**

Commit \`${sha:0:7}\`. A URL é fixa enquanto o PR estiver aberto (também aparece no card do Elfo).

- Worker \`$worker\` na Cloudflare
- Banco: branch \`$branch\` do Neon, copiada do staging (ou da produção, sem staging) no primeiro deploy deste PR

Os dois são apagados quando o PR é fechado ou mergeado."
    ;;
  skipped)
    text="### 🔎 Preview deste PR

Nada publicado: faltam no repositório os secrets $(codes "${arg:?faltando}"). $connect; o próximo push neste PR publica o preview."
    ;;
  closed)
    if [ "${WORKER_STATE:-}" = "absent" ] && [ "${DATABASE_STATE:-}" = "absent" ]; then
      text="### 🔎 Preview deste PR

PR fechado. Não havia preview para apagar."
    else
      text="### 🔎 Preview deste PR

PR fechado: o preview foi apagado (Worker \`$worker\` e branch \`$branch\` do Neon)."
    fi
    ;;
  closed-missing)
    text="### 🔎 Preview deste PR

PR fechado, mas o preview **não foi apagado**: faltam os secrets $(codes "${arg:?faltando}"). Apague à mão o Worker \`$worker\` (Cloudflare → Workers & Pages) e a branch \`$branch\` do Neon."
    ;;
  *)
    echo "::error::Estado desconhecido: $state" >&2
    exit 1
    ;;
esac

# O estado vai num segundo marcador: no fechamento, só um preview publicado pede aviso.
printf '%s\n<!-- elfo-preview-state: %s -->\n%s\n' "$marker" "$state" "$text" >"$tmp/body.md"
jq -n --rawfile body "$tmp/body.md" '{body: $body}' >"$tmp/body.json"

warn() {
  echo "::warning title=Comentário do preview::$1"
  exit 0
}

comments="$(gh api --paginate "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments?per_page=100" \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | contains(\"$marker\"))) | [.id, (.body | contains(\"elfo-preview-state: deployed\"))] | @tsv")" ||
  warn "não deu para ler os comentários do PR #$PR_NUMBER."
existing="$(sed -n 1p <<<"$comments")"
id="$(cut -f1 <<<"$existing")"
was_deployed="$(cut -f2 <<<"$existing")"

case "$state" in
  closed) [ -n "$id" ] || exit 0 ;;
  closed-missing) [ "$was_deployed" = "true" ] || exit 0 ;;
esac

if [ -n "$id" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" --input "$tmp/body.json" >/dev/null ||
    warn "não deu para atualizar o comentário do preview."
  echo "Comentário do preview atualizado ($state)."
else
  gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" --input "$tmp/body.json" >/dev/null ||
    warn "não deu para comentar no PR #$PR_NUMBER."
  echo "Comentário do preview criado ($state)."
fi
