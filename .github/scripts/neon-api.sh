# shellcheck shell=bash
# API v2 do Neon para os scripts de deploy. Use com `source` (não execute), depois de conferir
# NEON_API_KEY e NEON_PROJECT_ID; NEON_API_URL troca a base da API (testes).
#
#   neon <método> <caminho> [json]   corpo da resposta em stdout
#   neon_wait <resposta>             espera as operações citadas na resposta terminarem
#   neon_branch <nome>               a branch com exatamente esse nome, em JSON (vazio se não existe)
#   uri <texto>                      o texto codificado para uma URL
#   $neon_project                    NEON_PROJECT_ID codificado, para os caminhos
#
# Instala um `trap ... EXIT` que apaga o arquivo temporário das respostas.

neon_api="${NEON_API_URL:-https://console.neon.tech/api/v2}"
neon_body="$(mktemp)"
trap 'rm -f "$neon_body"' EXIT

uri() { jq -rn --arg v "$1" '$v|@uri'; }
neon_project="$(uri "$NEON_PROJECT_ID")"

# Repete em 423 (recurso ocupado por outra operação), 429 e 5xx, que a API diz serem seguros de
# repetir, e em erros de rede só nos GETs (um POST ou DELETE pode ter sido aplicado).
neon() {
  local method="$1" path="$2" status attempt
  local args=(-sS -o "$neon_body" -w '%{http_code}' --max-time 60 -X "$method"
    -H "Authorization: Bearer $NEON_API_KEY" -H "Accept: application/json")
  [ -z "${3:-}" ] || args+=(-H "Content-Type: application/json" --data "$3")
  for attempt in $(seq 1 10); do
    status="$(curl "${args[@]}" "$neon_api$path")" || status="000"
    case "$status" in
      2??) cat "$neon_body"; return 0 ;;
      423 | 429 | 5??) ;;
      000) [ "$method" = "GET" ] || break ;;
      *) break ;;
    esac
    [ "$attempt" -lt 10 ] || break
    echo "Neon API: HTTP $status em $method $path (tentativa $attempt/10), tentando de novo..." >&2
    sleep "${NEON_RETRY_SECONDS:-3}"
  done
  echo "::error title=Erro na API do Neon::$method $path respondeu HTTP $status: $(jq -r '.message // empty' "$neon_body" 2>/dev/null | head -c 300)" >&2
  return 1
}

# Espera as operações (criação de branch/compute, exclusão) terminarem: antes disso a API recusa,
# por exemplo, ler a senha da role.
neon_wait() {
  local id status i ids
  ids="$(jq -r '.operations[]?.id' <<<"$1")" || return 1
  for id in $ids; do
    for i in $(seq 1 60); do
      status="$(neon GET "/projects/$neon_project/operations/$id" | jq -r '.operation.status')" || return 1
      case "$status" in
        finished | skipped) break ;;
        failed | error | cancelled)
          echo "::error title=Operação do Neon falhou::A operação $id terminou com status '$status'." >&2
          return 1
          ;;
      esac
      [ "$i" -lt 60 ] || { echo "::error title=Neon demorou demais::A operação $id ainda está '$status' depois de 3 minutos." >&2; return 1; }
      sleep "${NEON_RETRY_SECONDS:-3}"
    done
  done
}

# A busca da API acha nomes parecidos ("preview/pr-1" acha "preview/pr-12"): filtra pelo nome exato.
neon_branch() {
  local found
  found="$(neon GET "/projects/$neon_project/branches?search=$(uri "$1")&limit=100")" || return 1
  jq -c --arg name "$1" '[.branches[]? | select(.name == $name)][0] // empty' <<<"$found"
}
