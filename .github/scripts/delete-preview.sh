#!/usr/bin/env bash
# Apaga o preview de um PR fechado: o Worker <nome>-pr-<n> na Cloudflare e a branch
# `preview/pr-<n>` do Neon (com o compute dela).
#
# Só apaga esses dois nomes: recusa um Worker que não termine em `-pr-<n>` e, no Neon, qualquer
# branch padrão, protegida, `production`, `staging` ou `main`. O que não existe (preview nunca
# publicado, ou já apagado) não é erro. Um erro da API numa das duas não impede de tentar a outra;
# no fim, sai com 1 dizendo o que sobrou para apagar à mão.
#
# Uso: delete-preview.sh <número-do-PR> <nome-do-worker>
#   env CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NEON_API_KEY, NEON_PROJECT_ID
#   (CLOUDFLARE_API_URL e NEON_API_URL trocam a base das APIs, para testes)
# Grava `worker=removed|absent` e `database=removed|absent` em $GITHUB_OUTPUT.
set -euo pipefail

pr="${1:?uso: delete-preview.sh <número-do-PR> <nome-do-worker>}"
worker="${2:?uso: delete-preview.sh <número-do-PR> <nome-do-worker>}"
output="${GITHUB_OUTPUT:-/dev/null}"
cf_api="${CLOUDFLARE_API_URL:-https://api.cloudflare.com/client/v4}"
branch_name="preview/pr-$pr"

if ! [[ "$pr" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error title=PR inválido::'$pr' não é um número de PR." >&2
  exit 1
fi
if ! [[ "$worker" =~ ^[a-z0-9][a-z0-9-]*-pr-${pr}$ ]]; then
  echo "::error title=Worker recusado::'$worker' não é o Worker de preview do PR #$pr (<nome>-pr-$pr); nada foi apagado." >&2
  exit 1
fi
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}" "${NEON_API_KEY:?}" "${NEON_PROJECT_ID:?}"

# shellcheck source=neon-api.sh
source "$(dirname "$0")/neon-api.sh"
cf_body="$(mktemp)"
trap 'rm -f "$neon_body" "$cf_body"' EXIT

leftovers=()

# DELETE do script na API de Workers (`force`: apaga junto bindings/Durable Objects do próprio
# preview). 404 = já não existe. Repete em 429 e 5xx.
delete_worker() {
  local status attempt url
  url="$cf_api/accounts/$(uri "$CLOUDFLARE_ACCOUNT_ID")/workers/scripts/$worker?force=true"
  for attempt in 1 2 3 4 5; do
    status="$(curl -sS -o "$cf_body" -w '%{http_code}' --max-time 60 -X DELETE \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$url")" || status="000"
    case "$status" in
      2??) echo "Worker '$worker' apagado."; echo "worker=removed" >>"$output"; return 0 ;;
      404) echo "Worker '$worker' não existe (nada a apagar)."; echo "worker=absent" >>"$output"; return 0 ;;
      000 | 429 | 5??) ;;
      *) break ;;
    esac
    [ "$attempt" -lt 5 ] || break
    echo "Cloudflare: HTTP $status em DELETE do Worker (tentativa $attempt/5), tentando de novo..." >&2
    sleep "${CF_RETRY_SECONDS:-3}"
  done
  echo "::error title=Worker não apagado::DELETE do Worker '$worker' respondeu HTTP $status: $(jq -r '[.errors[]?.message] | join("; ")' "$cf_body" 2>/dev/null | head -c 300)" >&2
  return 1
}

delete_branch() {
  local branch id refused deleted
  branch="$(neon_branch "$branch_name")" || return 1
  if [ -z "$branch" ]; then
    echo "Branch '$branch_name' do Neon não existe (nada a apagar)."
    echo "database=absent" >>"$output"
    return 0
  fi
  id="$(jq -r '.id' <<<"$branch")"
  refused="$(jq -r --arg name "$branch_name" '
    if .name != $name then "o nome não é \($name)"
    elif .default == true then "é a branch padrão do projeto"
    elif .protected == true then "é uma branch protegida"
    elif (.name | IN("production", "staging", "main")) then "é a branch \(.name)"
    else empty end' <<<"$branch")"
  if [ -n "$refused" ]; then
    echo "::error title=Branch do Neon recusada::A branch '$branch_name' ($id) não foi apagada: $refused." >&2
    return 1
  fi
  deleted="$(neon DELETE "/projects/$neon_project/branches/$(uri "$id")")" || return 1
  neon_wait "$deleted" || return 1
  echo "Branch '$branch_name' do Neon apagada ($id)."
  echo "database=removed" >>"$output"
}

# Primeiro o Worker (para de receber tráfego), depois o banco.
delete_worker || leftovers+=("o Worker \`$worker\` (Cloudflare → Workers & Pages)")
delete_branch || leftovers+=("a branch \`$branch_name\` do Neon")

if [ "${#leftovers[@]}" -gt 0 ]; then
  {
    echo "## ⚠️ Preview do PR #$pr não foi todo apagado"
    echo
    echo "Apague à mão:"
    for item in "${leftovers[@]}"; do echo "- $item"; done
  } >>"${GITHUB_STEP_SUMMARY:-/dev/stderr}"
  exit 1
fi
