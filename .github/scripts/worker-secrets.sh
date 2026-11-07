#!/usr/bin/env bash
# Monta o arquivo JSON de secrets que o `wrangler deploy --secrets-file` grava no Worker,
# na mesma versão do deploy (sem janela com o código novo e os secrets velhos):
#   - cada secret de foreman.json → secrets gravado no repositório ou no environment do GitHub
#     (o do environment tem prioridade); os opcionais vazios ficam de fora e o Worker mantém o
#     valor que já tinha;
#   - DATABASE_URL = a connection string com pooling do ambiente (<db-dir>/pooled-url).
# Nunca entram no Worker: CLOUDFLARE_*, NEON_*, GITHUB_* e as outras DATABASE_URL*.
#
# Uso: worker-secrets.sh <db-dir> <arquivo.json>   (env: os secrets de foreman.json, pelo nome)
set -euo pipefail

db_dir="${1:?uso: worker-secrets.sh <db-dir> <arquivo.json>}"
out="${2:?uso: worker-secrets.sh <db-dir> <arquivo.json>}"
config="${FOREMAN_CONFIG:-foreman.json}"

umask 077
pooled=""
[ ! -f "$db_dir/pooled-url" ] || pooled="$(cat "$db_dir/pooled-url")"

# Os valores vão pelo ambiente do jq, nunca pela linha de comando (visível em ps). Erros do
# jq ficam fora do log: poderiam citar um pedaço dos valores.
POOLED_URL="$pooled" jq -n --slurpfile config "$config" '
  ($config[0].secrets // [] | map(.name)) as $names
  | reduce $names[] as $n ({};
      if ($n | test("^(CLOUDFLARE_|NEON_|GITHUB_|DATABASE_URL)") | not) and (($ENV[$n] // "") != "")
      then . + {($n): $ENV[$n]} else . end)
  + (if env.POOLED_URL != "" then {DATABASE_URL: env.POOLED_URL} else {} end)
' >"$out" 2>/dev/null || {
  echo "::error title=Secrets do Worker::Não deu para montar os secrets do Worker a partir de $config." >&2
  exit 1
}

echo "Secrets do Worker: $(jq -r 'keys | join(", ")' "$out")."
