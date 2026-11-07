#!/usr/bin/env bash
# Descobre as connection strings do Postgres (Neon) do ambiente e grava em arquivos
# (nunca no log): <dir>/direct-url (migrations) e <dir>/pooled-url (o app, em runtime).
#
#   production: DATABASE_URL (direta) e DATABASE_URL_POOLED (pooling), gravados pelo Elfo
#               apontando para a branch padrão do projeto Neon. Sem a pooled, usa a direta.
#   staging:    a branch `staging` do projeto NEON_PROJECT_ID, criada a partir da branch padrão
#               (schema e dados do momento) na primeira vez, pela API v2 do Neon.
#   preview:    a branch NEON_BRANCH (ex.: `preview/pr-12`), criada na primeira vez como cópia da
#               branch NEON_PARENT_BRANCH (ex.: `staging`) se ela existir, senão da padrão.
#               Banco: `neondb` se existir, senão o primeiro; role: o dono do banco.
#
# Uso: database-urls.sh <production|staging|preview> <dir>
#   env production:       DATABASE_URL, DATABASE_URL_POOLED (opcional)
#   env staging, preview: NEON_API_KEY, NEON_PROJECT_ID; NEON_BRANCH (padrão: o nome do ambiente),
#                         NEON_PARENT_BRANCH (opcional; padrão: a branch padrão do projeto)
set -euo pipefail

environment="${1:?uso: database-urls.sh <production|staging|preview> <dir>}"
dir="${2:?uso: database-urls.sh <production|staging|preview> <dir>}"

umask 077
mkdir -p "$dir"

# Esconde do log a URL e a senha dela (as que vêm de `secrets` o GitHub já esconde).
mask_url() {
  local url="$1" password
  echo "::add-mask::$url"
  password="$(sed -nE 's#^[a-z]+://[^:/@]+:([^@]+)@.*#\1#p' <<<"$url")"
  [ -z "$password" ] || echo "::add-mask::$password"
}

save() { # save <direct> <pooled>
  printf '%s' "$1" >"$dir/direct-url"
  printf '%s' "$2" >"$dir/pooled-url"
}

if [ "$environment" = "production" ]; then
  : "${DATABASE_URL:?DATABASE_URL não definido: conecte o Neon no Elfo (Board → Settings → Deploy)}"
  save "$DATABASE_URL" "${DATABASE_URL_POOLED:-$DATABASE_URL}"
  echo "Banco de produção: branch padrão do projeto Neon (DATABASE_URL / DATABASE_URL_POOLED)."
  exit 0
fi

: "${NEON_API_KEY:?NEON_API_KEY não definido: conecte o Neon no Elfo (Board → Settings → Deploy)}"
: "${NEON_PROJECT_ID:?NEON_PROJECT_ID não definido: conecte o Neon no Elfo (Board → Settings → Deploy)}"
branch_name="${NEON_BRANCH:-$environment}"
parent_name="${NEON_PARENT_BRANCH:-}"
# shellcheck source=neon-api.sh
source "$(dirname "$0")/neon-api.sh"

branch="$(neon_branch "$branch_name")"
branch_id="$(jq -r '.id // empty' <<<"$branch")"

if [ -z "$branch_id" ]; then
  parent_id=""
  [ -z "$parent_name" ] || parent_id="$(neon_branch "$parent_name" | jq -r '.id // empty')"
  if [ -n "$parent_id" ]; then
    echo "Criando a branch '$branch_name' no Neon a partir da branch '$parent_name'..."
  else
    echo "Criando a branch '$branch_name' no Neon a partir da branch padrão..."
  fi
  created="$(neon POST "/projects/$neon_project/branches" \
    "$(jq -cn --arg name "$branch_name" --arg parent "$parent_id" \
      '{branch: ({name: $name} + (if $parent == "" then {} else {parent_id: $parent} end)), endpoints: [{type: "read_write"}]}')")"
  branch_id="$(jq -r '.branch.id' <<<"$created")"
  neon_wait "$created"
  echo "Branch '$branch_name' criada ($branch_id)."
else
  echo "Branch '$branch_name' do Neon: $branch_id."
  # Uma branch criada à mão pode não ter compute: sem um endpoint read_write não há conexão.
  if ! neon GET "/projects/$neon_project/branches/$branch_id/endpoints" |
    jq -e '[.endpoints[]? | select(.type == "read_write")] | length > 0' >/dev/null; then
    echo "A branch '$branch_name' não tem compute read_write; criando..."
    created="$(neon POST "/projects/$neon_project/endpoints" \
      "$(jq -cn --arg id "$branch_id" '{endpoint: {branch_id: $id, type: "read_write"}}')")"
    neon_wait "$created"
  fi
fi

databases="$(neon GET "/projects/$neon_project/branches/$branch_id/databases")"
database="$(jq -r '(.databases | map(select(.name == "neondb")) + .)[0].name // empty' <<<"$databases")"
role="$(jq -r --arg db "$database" '.databases[] | select(.name == $db) | .owner_name' <<<"$databases")"
if [ -z "$database" ] || [ -z "$role" ]; then
  echo "::error title=Branch sem banco::A branch '$branch_name' do Neon não tem nenhum banco de dados." >&2
  exit 1
fi
echo "Banco '$database' (role '$role')."

query="branch_id=$branch_id&database_name=$(jq -rn --arg v "$database" '$v|@uri')&role_name=$(jq -rn --arg v "$role" '$v|@uri')"
direct="$(neon GET "/projects/$neon_project/connection_uri?$query&pooled=false" | jq -r '.uri // empty')"
[ -z "$direct" ] || mask_url "$direct"
pooled="$(neon GET "/projects/$neon_project/connection_uri?$query&pooled=true" | jq -r '.uri // empty')"
[ -z "$pooled" ] || mask_url "$pooled"
if [ -z "$direct" ] || [ -z "$pooled" ]; then
  echo "::error title=Sem connection string::A API do Neon não devolveu a connection string da branch '$branch_name'." >&2
  exit 1
fi

save "$direct" "$pooled"
echo "Banco de $environment: branch '$branch_name' do Neon."
