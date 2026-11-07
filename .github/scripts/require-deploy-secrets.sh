#!/usr/bin/env bash
# Confere, antes de instalar e buildar, se o repositório tem tudo que o deploy precisa:
#   - CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID (sempre);
#   - banco Neon ("database": "neon" no foreman.json): DATABASE_URL em production;
#     NEON_API_KEY e NEON_PROJECT_ID em staging e preview (as branches `staging` e `preview/pr-<n>`
#     do Neon são criadas pela API);
#   - os secrets do app em foreman.json → secrets que não são `optional`.
# O Elfo grava todos eles ao conectar a Cloudflare (e o Neon) no board.
#
# preview (o preview de um PR): faltar algum não é erro. Grava `ready=false` e `missing=<nomes>`
# (para o comentário no PR) e sai com 0: o PR não fica vermelho por falta de configuração.
#
# Uso: require-deploy-secrets.sh <production|staging|preview>
#   env: cada secret pelo nome (CLOUDFLARE_*, NEON_*, DATABASE_URL*, os de foreman.json), como o
#   workflow passa; nada daqui é impresso. (Nunca todos os secrets de uma vez: o GitHub segura em repositórios
#   públicos os runs que entregam todos os secrets a um script.)
#   env SKIP_IF_MISSING=true: o próprio repositório-template, sem conta da Cloudflare.
# Grava `ready=true|false` em $GITHUB_OUTPUT: os passos seguintes só rodam com `ready=true`.
set -euo pipefail

environment="${1:?uso: require-deploy-secrets.sh <production|staging|preview>}"
output="${GITHUB_OUTPUT:-/dev/null}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stderr}"
config="${FOREMAN_CONFIG:-foreman.json}"
has() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || return 1
  [ -n "${!1:-}" ]
}

missing_cloudflare=()
for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
  has "$name" || missing_cloudflare+=("$name")
done

# No repositório-template a falta da Cloudflare só pula o deploy (o job passa); nos repositórios
# criados a partir dele, falha explicando o que conectar.
if [ "${#missing_cloudflare[@]}" -gt 0 ] && [ "${SKIP_IF_MISSING:-false}" = "true" ] && [ "$environment" != "preview" ]; then
  echo "ready=false" >>"$output"
  echo "::notice title=Deploy pulado no template::Este é o repositório-template e não tem conta da Cloudflare conectada; nada foi publicado. Os repositórios criados a partir dele publicam sozinhos depois de conectar a Cloudflare no Elfo."
  {
    echo "## ⏭️ Deploy pulado"
    echo
    echo "\`${GITHUB_REPOSITORY:-este repositório}\` é um repositório-template sem os secrets da Cloudflare, então nada foi publicado."
  } >>"$summary"
  exit 0
fi

missing_neon=()
database="$(jq -r '.deploy.database // "none"' "$config" 2>/dev/null || echo none)"
if [ "$database" = "neon" ]; then
  if [ "$environment" != "production" ]; then
    for name in NEON_API_KEY NEON_PROJECT_ID; do has "$name" || missing_neon+=("$name"); done
  else
    if ! has DATABASE_URL; then
      missing_neon+=("DATABASE_URL")
    elif ! has DATABASE_URL_POOLED; then
      echo "::warning title=Sem DATABASE_URL_POOLED::O app vai usar a conexão direta (DATABASE_URL) em produção. Reconecte o Neon no Elfo (Board → Settings → Deploy) para gravar a conexão com pooling."
    fi
  fi
fi

missing_app=()
while IFS= read -r name; do
  [ -n "$name" ] || continue
  has "$name" || missing_app+=("$name")
done < <(jq -r '.secrets[]? | select((.optional // false) | not) | .name' "$config")

if [ "$((${#missing_cloudflare[@]} + ${#missing_neon[@]} + ${#missing_app[@]}))" -eq 0 ]; then
  echo "Secrets do deploy ($environment) configurados."
  echo "ready=true" >>"$output"
  exit 0
fi

echo "ready=false" >>"$output"

join() { local names="$*"; echo "${names// /, }"; }

if [ "$environment" = "preview" ]; then
  missing="$(join "${missing_cloudflare[@]}" "${missing_neon[@]}" "${missing_app[@]}")"
  echo "missing=$missing" >>"$output"
  echo "::notice title=Preview pulado::Faltam $missing. No Elfo, abra o board → Settings → Deploy e conecte a Cloudflare e o Neon; o próximo push no PR publica o preview."
  {
    echo "## ⏭️ Preview pulado"
    echo
    echo "Faltam secrets no repositório: $missing. No [Elfo](https://elfo.dev), abra o board deste"
    echo "repositório → **Settings → Deploy** e conecte a Cloudflare e o Neon."
  } >>"$summary"
  exit 0
fi

[ "${#missing_cloudflare[@]}" -eq 0 ] ||
  echo "::error title=Cloudflare não conectada::Faltam $(join "${missing_cloudflare[@]}"). No Elfo, abra o board → Settings → Deploy e conecte a conta da Cloudflare; o Elfo grava os secrets e roda o deploy de novo."
[ "${#missing_neon[@]}" -eq 0 ] ||
  echo "::error title=Neon não conectado::Faltam $(join "${missing_neon[@]}"). No Elfo, abra o board → Settings → Deploy e conecte o projeto do Neon."
[ "${#missing_app[@]}" -eq 0 ] ||
  echo "::error title=Faltam secrets do app::Faltam $(join "${missing_app[@]}") (foreman.json → secrets). No Elfo, abra o board → Settings → Deploy para gravá-los (ou gh secret set <NOME>)."

{
  echo "## ❌ Deploy de $environment sem configuração"
  echo
  echo "Faltam secrets no repositório:"
  echo
  for name in "${missing_cloudflare[@]}" "${missing_neon[@]}" "${missing_app[@]}"; do
    [ -n "$name" ] && echo "- \`$name\`"
  done
  echo
  echo "No [Elfo](https://elfo.dev), abra o board deste repositório → **Settings → Deploy** e conecte"
  echo "a Cloudflare$([ "$database" = "neon" ] && echo " e o Neon"). O Elfo grava os secrets e começa o deploy sozinho."
} >>"$summary"

exit 1
