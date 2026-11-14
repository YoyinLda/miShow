#!/usr/bin/env bash
# Alerta de scraping (brief 008, entrega C).
# Abre (o comenta) un issue cuando una fuente falla 2 corridas seguidas y lo
# cierra cuando se recupera. Lo llama el último paso de cada workflow de scrape
# con `if: always()`. Solo usa GITHUB_TOKEN (permisos issues:write, actions:read).
#
# Uso: scrape-alert.sh <fuente> <outcome del paso de scrape: success|failure|...> <archivo del workflow>
set -euo pipefail

SOURCE="$1"
OUTCOME="$2"
WORKFLOW_FILE="$3"
LABEL="scraper-alert"
TITLE="[scraper] ${SOURCE} falla en corridas seguidas"
RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

existing_issue() {
  gh issue list --label "$LABEL" --state open --search "\"$TITLE\" in:title" --json number --jq '.[0].number // empty'
}

if [ "$OUTCOME" = "success" ]; then
  issue="$(existing_issue)"
  if [ -n "$issue" ]; then
    gh issue close "$issue" --comment "Recuperado: la corrida ${RUN_URL} terminó bien."
  fi
  exit 0
fi

# Solo cuentan fallas reales del paso de scrape (no cancelaciones ni pasos omitidos).
[ "$OUTCOME" = "failure" ] || exit 0

# Conclusión de la corrida completada anterior de este mismo workflow.
previous="$(gh run list --workflow "$WORKFLOW_FILE" --status completed --limit 1 --json conclusion --jq '.[0].conclusion // empty')"
if [ "$previous" != "failure" ]; then
  echo "Primera falla seguida de ${SOURCE}; se alerta si la próxima corrida también falla."
  exit 0
fi

gh label create "$LABEL" --color B60205 --description "Fallas seguidas de un scraper (brief 008)" --force >/dev/null
issue="$(existing_issue)"
body="La fuente **${SOURCE}** falló al menos 2 corridas seguidas. Última: ${RUN_URL}

Revisar \`scrape_errors\` de la corrida (código, etapa y estado HTTP) y \`docs/operacion-scraping-cron.md\`."
if [ -n "$issue" ]; then
  gh issue comment "$issue" --body "Sigue fallando: ${RUN_URL}"
else
  gh issue create --title "$TITLE" --label "$LABEL" --body "$body"
fi
