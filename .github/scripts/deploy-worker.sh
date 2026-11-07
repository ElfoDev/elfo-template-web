#!/usr/bin/env bash
# Publica o build (`pnpm build`) como o Worker <nome>, com os secrets do arquivo JSON na mesma
# versão, e grava as URLs em $GITHUB_OUTPUT (`workers_dev_url`, `url`) e no resumo do job.
#
# Staging e os previews de PR não herdam domínios próprios nem rotas do wrangler.jsonc (são da
# produção, e dois Workers não podem ter o mesmo domínio): publicam só em
# <nome>.<conta>.workers.dev.
#
# Uso: deploy-worker.sh <nome-do-worker> <production|staging|preview-pr-<n>> <secrets.json>
#   env CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID
set -euo pipefail

usage="uso: deploy-worker.sh <nome-do-worker> <production|staging|preview-pr-<n>> <secrets.json>"
name="${1:?$usage}"
environment="${2:?$usage}"
secrets_file="${3:?$usage}"
output="${GITHUB_OUTPUT:-/dev/null}"
tmp="${RUNNER_TEMP:-$(mktemp -d)}"

# O plugin da Cloudflare no Vite gera a config final do Worker em dist/ e aponta para ela aqui.
redirect=".wrangler/deploy/config.json"
if [ ! -f "$redirect" ]; then
  echo "::error title=Build não encontrado::$redirect não existe; rode \`pnpm build\` antes do deploy." >&2
  exit 1
fi
config="$(dirname "$redirect")/$(jq -r '.configPath' "$redirect")"

if [ "$environment" != "production" ]; then
  jq 'del(.routes, .route) | .workers_dev = true' "$config" >"$tmp/wrangler-workers-dev.json"
  mv "$tmp/wrangler-workers-dev.json" "$config"
fi

result="$tmp/wrangler-output.json"
log="$tmp/wrangler-deploy.log"
rm -f "$result"
WRANGLER_OUTPUT_FILE_PATH="$result" pnpm exec wrangler deploy \
  --name "$name" \
  --secrets-file "$secrets_file" \
  --message "$environment ${GITHUB_SHA:-local}" 2>&1 | tee "$log"

# Destinos do deploy: "https://<nome>.<conta>.workers.dev", "<domínio> (custom domain)", rotas...
targets="$(jq -r 'select(.type == "deploy") | .targets[]?' "$result" 2>/dev/null || true)"
[ -n "$targets" ] || targets="$(sed -E 's/^[[:space:]]+//' "$log")"
workers_dev="$(grep -m1 -oE '^https://[a-z0-9.-]+\.workers\.dev$' <<<"$targets" || true)"
custom="$(grep -m1 -oE '^[a-z0-9.-]+ \(custom domain\)$' <<<"$targets" | awk '{print $1}' || true)"

url="${custom:+https://$custom}"
url="${url:-$workers_dev}"
if [ -z "$url" ]; then
  echo "::error title=URL do Worker não encontrada::O deploy terminou sem URL. Confira se 'workers_dev' está true no wrangler.jsonc e se a conta tem um subdomínio workers.dev (painel da Cloudflare → Workers & Pages)." >&2
  exit 1
fi

echo "workers_dev_url=$workers_dev" >>"$output"
echo "url=$url" >>"$output"
{
  echo "## 🚀 Publicado em $environment"
  echo
  echo "- **$environment**: $url"
  [ -z "$workers_dev" ] || [ "$url" = "$workers_dev" ] || echo "- workers.dev: $workers_dev"
  echo "- Worker: \`$name\`"
} >>"${GITHUB_STEP_SUMMARY:-/dev/stderr}"
