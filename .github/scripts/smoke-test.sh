#!/usr/bin/env bash
# Smoke test do app publicado:
#   1. a página (SPA) responde 200;
#   2. GET /api/health responde 200 com o banco "ok" (o Worker conecta no Postgres);
#   3. o Better Auth aceita um POST vindo da própria URL: um login com senha errada responde
#      401 (e não 403 "origin inválida" nem 503 "sem BETTER_AUTH_SECRET").
# Logo após o deploy a URL pode levar um tempo para responder: 1 e 2 são repetidos até
# SMOKE_ATTEMPTS vezes (padrão 36) com SMOKE_INTERVAL segundos (padrão 5) entre elas (~3 min):
# um Worker novo (o primeiro deploy de produção ou de staging) pode levar mais de 1 min para
# aparecer no workers.dev.
# Uso: smoke-test.sh <url>
set -euo pipefail

base="${1:?uso: smoke-test.sh <url>}"
base="${base%/}"
attempts="${SMOKE_ATTEMPTS:-36}"
interval="${SMOKE_INTERVAL:-5}"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT

fetch() { # fetch <url> [curl args...] → status HTTP; corpo em $body
  local url="$1" status
  shift
  status="$(curl -sS -o "$body" -w '%{http_code}' --max-time 20 "$@" "$url")" || status="000"
  echo "$status"
}

for i in $(seq 1 "$attempts"); do
  health="" detail=""
  page="$(fetch "$base/")"
  if [ "$page" = "200" ] && grep -q 'id="root"' "$body"; then
    health="$(fetch "$base/api/health")"
    if [ "$health" = "200" ] && jq -e '.status == "ok"' "$body" >/dev/null 2>&1; then
      echo "✅ $base/ e $base/api/health respondem 200, banco ok (tentativa $i)."
      break
    fi
    detail="$(jq -c '.services // .error // empty' "$body" 2>/dev/null | head -c 300 || true)"
  fi
  echo "Tentativa $i/$attempts: página HTTP $page, /api/health HTTP ${health:-—} ${detail}"
  if [ "$i" -eq "$attempts" ]; then
    if [ "$page" != "200" ]; then
      echo "::error title=Smoke test falhou::$base/ respondeu HTTP $page (esperado 200 com a SPA)."
    else
      echo "::error title=Smoke test falhou::$base/api/health respondeu HTTP ${health:-—} ${detail} (esperado 200 com status ok). Confira o DATABASE_URL e se as migrations rodaram."
    fi
    exit 1
  fi
  sleep "$interval"
done

# O Better Auth só confere a origin quando o request tem cookie: manda um qualquer.
# Uma resposta 429 (rate limit) espera a janela de 10 s e tenta mais uma vez.
for i in 1 2; do
  auth="$(fetch "$base/api/auth/sign-in/email" -X POST \
    -H "Content-Type: application/json" -H "Origin: $base" -H "Cookie: elfo-smoke-test=1" \
    --data '{"email":"smoke-test@example.com","password":"smoke-test-password"}')"
  [ "$auth" = "429" ] && [ "$i" -eq 1 ] && { sleep 11; continue; }
  break
done
case "$auth" in
  401) echo "✅ Better Auth responde na própria URL (login inválido → 401)." ;;
  403)
    echo "::error title=Better Auth recusou a origin::POST de $base respondeu 403 ($(jq -r '.message // .code // empty' "$body" 2>/dev/null | head -c 200)). Deixe BETTER_AUTH_URL vazia no wrangler.jsonc ou com esta URL."
    exit 1
    ;;
  *)
    echo "::error title=Better Auth não respondeu::POST $base/api/auth/sign-in/email respondeu HTTP $auth (esperado 401): $(jq -r '.error // .message // empty' "$body" 2>/dev/null | head -c 200)"
    exit 1
    ;;
esac
