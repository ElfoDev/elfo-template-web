#!/usr/bin/env bash
# Descobre as connection strings do Postgres (Neon) do ambiente e grava em arquivos
# (nunca no log): <dir>/direct-url (migrations) e <dir>/pooled-url (o app, em runtime).
#
#   production: DATABASE_URL (direta) e DATABASE_URL_POOLED (pooling), gravados pelo Elfo
#               apontando para a branch padrão do projeto Neon. Sem a pooled, usa a direta.
#   staging:    a branch `staging` do projeto NEON_PROJECT_ID, criada a partir da branch padrão
#               (schema e dados do momento) na primeira vez, pela API v2 do Neon.
#               Banco: `neondb` se existir, senão o primeiro; role: o dono do banco.
#
# Uso: database-urls.sh <production|staging> <dir>
#   env production: DATABASE_URL, DATABASE_URL_POOLED (opcional)
#   env staging:    NEON_API_KEY, NEON_PROJECT_ID; NEON_BRANCH (padrão "staging")
set -euo pipefail

environment="${1:?uso: database-urls.sh <production|staging> <dir>}"
dir="${2:?uso: database-urls.sh <production|staging> <dir>}"
api="${NEON_API_URL:-https://console.neon.tech/api/v2}"

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
project="$(jq -rn --arg v "$NEON_PROJECT_ID" '$v|@uri')"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT

# neon <método> <caminho> [json] → corpo da resposta em stdout. Repete em 423 (recurso
# ocupado por outra operação), 429 e 5xx, que a API diz serem seguros de repetir, e em
# erros de rede só nos GETs (um POST pode ter sido aplicado).
neon() {
  local method="$1" path="$2" status attempt
  local args=(-sS -o "$body" -w '%{http_code}' --max-time 60 -X "$method"
    -H "Authorization: Bearer $NEON_API_KEY" -H "Accept: application/json")
  [ -z "${3:-}" ] || args+=(-H "Content-Type: application/json" --data "$3")
  for attempt in $(seq 1 10); do
    status="$(curl "${args[@]}" "$api$path")" || status="000"
    case "$status" in
      2??) cat "$body"; return 0 ;;
      423 | 429 | 5??) ;;
      000) [ "$method" = "GET" ] || break ;;
      *) break ;;
    esac
    [ "$attempt" -lt 10 ] || break
    echo "Neon API: HTTP $status em $method $path (tentativa $attempt/10), tentando de novo..." >&2
    sleep 3
  done
  echo "::error title=Erro na API do Neon::$method $path respondeu HTTP $status: $(jq -r '.message // empty' "$body" 2>/dev/null | head -c 300)" >&2
  return 1
}

# Espera as operações (criação de branch/compute) terminarem: antes disso a API recusa
# ler a senha da role.
wait_operations() {
  local id status i
  for id in $(jq -r '.operations[]?.id' <<<"$1"); do
    for i in $(seq 1 60); do
      status="$(neon GET "/projects/$project/operations/$id" | jq -r '.operation.status')"
      case "$status" in
        finished | skipped) break ;;
        failed | error | cancelled)
          echo "::error title=Operação do Neon falhou::A operação $id terminou com status '$status'." >&2
          return 1
          ;;
      esac
      [ "$i" -lt 60 ] || { echo "::error title=Neon demorou demais::A operação $id ainda está '$status' depois de 3 minutos." >&2; return 1; }
      sleep 3
    done
  done
}

branch_id="$(neon GET "/projects/$project/branches?search=$(jq -rn --arg v "$branch_name" '$v|@uri')&limit=100" |
  jq -r --arg name "$branch_name" '[.branches[] | select(.name == $name)][0].id // empty')"

if [ -z "$branch_id" ]; then
  echo "Criando a branch '$branch_name' no Neon a partir da branch padrão..."
  created="$(neon POST "/projects/$project/branches" \
    "$(jq -cn --arg name "$branch_name" '{branch: {name: $name}, endpoints: [{type: "read_write"}]}')")"
  branch_id="$(jq -r '.branch.id' <<<"$created")"
  wait_operations "$created"
  echo "Branch '$branch_name' criada ($branch_id)."
else
  echo "Branch '$branch_name' do Neon: $branch_id."
  # Uma branch criada à mão pode não ter compute: sem um endpoint read_write não há conexão.
  if ! neon GET "/projects/$project/branches/$branch_id/endpoints" |
    jq -e '[.endpoints[]? | select(.type == "read_write")] | length > 0' >/dev/null; then
    echo "A branch '$branch_name' não tem compute read_write; criando..."
    created="$(neon POST "/projects/$project/endpoints" \
      "$(jq -cn --arg id "$branch_id" '{endpoint: {branch_id: $id, type: "read_write"}}')")"
    wait_operations "$created"
  fi
fi

databases="$(neon GET "/projects/$project/branches/$branch_id/databases")"
database="$(jq -r '(.databases | map(select(.name == "neondb")) + .)[0].name // empty' <<<"$databases")"
role="$(jq -r --arg db "$database" '.databases[] | select(.name == $db) | .owner_name' <<<"$databases")"
if [ -z "$database" ] || [ -z "$role" ]; then
  echo "::error title=Branch sem banco::A branch '$branch_name' do Neon não tem nenhum banco de dados." >&2
  exit 1
fi
echo "Banco '$database' (role '$role')."

query="branch_id=$branch_id&database_name=$(jq -rn --arg v "$database" '$v|@uri')&role_name=$(jq -rn --arg v "$role" '$v|@uri')"
direct="$(neon GET "/projects/$project/connection_uri?$query&pooled=false" | jq -r '.uri // empty')"
[ -z "$direct" ] || mask_url "$direct"
pooled="$(neon GET "/projects/$project/connection_uri?$query&pooled=true" | jq -r '.uri // empty')"
[ -z "$pooled" ] || mask_url "$pooled"
if [ -z "$direct" ] || [ -z "$pooled" ]; then
  echo "::error title=Sem connection string::A API do Neon não devolveu a connection string da branch '$branch_name'." >&2
  exit 1
fi

save "$direct" "$pooled"
echo "Banco de $environment: branch '$branch_name' do Neon."
