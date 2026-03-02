#!/usr/bin/env bash
# Smoke-test seed script — registers multiple providers with agents and a consumer.
# Outputs all created IDs so you can run coordinations manually.
#
# Usage: ./scripts/smoke-seed.sh [BASE_URL]

set -euo pipefail

BASE="${1:-http://localhost:3100}"
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
CYAN="\033[36m"
RESET="\033[0m"

# register <label> <method> <path> <body> <id_jq_path>
# Prints the ID to stdout (for capture), everything else to stderr.
register() {
  local label="$1" method="$2" path="$3" body="$4" id_path="$5"

  local response
  response=$(curl -sf -X "$method" "$BASE$path" \
    -H "Content-Type: application/json" \
    -d "$body") || {
    printf "  \033[31m✗\033[0m %-28s (curl failed — is the server running?)\n" "$label" >&2
    return 1
  }

  local id
  id=$(echo "$response" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())${id_path})")

  # Show API key if present
  local api_key
  api_key=$(echo "$response" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read()).get('data', {})
print(d.get('apiKey', ''))" 2>/dev/null || true)

  if [[ -n "$api_key" ]]; then
    printf "  ${GREEN}✓${RESET} %-28s ${BOLD}%s${RESET}  ${DIM}key: %s${RESET}\n" "$label" "$id" "$api_key" >&2
  else
    printf "  ${GREEN}✓${RESET} %-28s ${BOLD}%s${RESET}\n" "$label" "$id" >&2
  fi

  # Only the raw ID goes to stdout
  echo "$id"
}

printf "\n${CYAN}${BOLD}ASC Smoke-Test Seed${RESET}  →  $BASE\n" >&2
echo "────────────────────────────────────────────" >&2

# ── Cleanup previous seed data ────────────────

printf "\n${BOLD}Cleanup${RESET}\n" >&2

# Extract IDs from a list endpoint. Usage: list_ids "/api/agents" "agents"
list_ids() {
  local path="$1" key="$2"
  curl -sf "$BASE${path}?limit=100" 2>/dev/null \
    | python3 -c "
import sys, json
data = json.loads(sys.stdin.read()).get('data', {})
for item in data.get('${key}', []):
    print(item['id'])" 2>/dev/null || true
}

# Delete agents first (depend on providers)
agent_ids=$(list_ids "/api/agents" "agents")
agent_count=0
for id in $agent_ids; do
  curl -sf -X DELETE "$BASE/api/agents/$id" >/dev/null 2>&1 || true
  agent_count=$((agent_count + 1))
done

# Delete providers
provider_ids=$(list_ids "/api/providers" "providers")
provider_count=0
for id in $provider_ids; do
  curl -sf -X DELETE "$BASE/api/providers/$id" >/dev/null 2>&1 || true
  provider_count=$((provider_count + 1))
done

# Delete consumers
consumer_ids=$(list_ids "/api/consumers" "consumers")
consumer_count=0
for id in $consumer_ids; do
  curl -sf -X DELETE "$BASE/api/consumers/$id" >/dev/null 2>&1 || true
  consumer_count=$((consumer_count + 1))
done

total=$((agent_count + provider_count + consumer_count))
if [[ $total -gt 0 ]]; then
  printf "  ${GREEN}✓${RESET} Deleted %d agents, %d providers, %d consumers\n" "$agent_count" "$provider_count" "$consumer_count" >&2
else
  printf "  ${DIM}— Nothing to clean up${RESET}\n" >&2
fi

# ── Consumer ──────────────────────────────────

printf "\n${BOLD}Consumer${RESET}\n" >&2
CONSUMER_ID=$(register "Acme Corp" POST "/api/consumers" '{
  "name": "Acme Corp",
  "description": "Enterprise consumer running multi-agent workflows",
  "contactEmail": "ops@acme.example"
}' "['data']['consumer']['id']")

# ── Provider A: NLP Labs ──────────────────────

printf "\n${BOLD}Provider A — NLP Labs${RESET}\n" >&2
PROVIDER_A=$(register "NLP Labs" POST "/api/providers" '{
  "name": "NLP Labs",
  "description": "Natural language processing specialists",
  "contactEmail": "eng@nlplabs.example",
  "webhookUrl": "http://localhost:4100"
}' "['data']['provider']['id']")
# Activate provider + all its agents after registration
activate() { curl -sf -X PATCH "$BASE/api/$1/$2" -H "Content-Type: application/json" -d '{"status":"active"}' >/dev/null; }
activate providers "$PROVIDER_A"

AGENT_A1=$(register "  Echo Agent" POST "/api/providers/$PROVIDER_A/agents" '{
  "name": "Echo Agent",
  "description": "Returns input as output — useful for testing",
  "version": "1.0.0",
  "capabilities": [{"name": "echo", "description": "Echoes input", "inputSchema": {}, "outputSchema": {}}],
  "pricing": {"type": "per_invocation", "pricePerCall": {"amountCents": 1, "currency": "USD"}},
  "sla": {"maxLatencyMs": 500, "uptimePercentage": 99.9, "maxErrorRate": 0.01},
  "supportsStreaming": false
}' "['data']['agent']['id']")
activate agents "$AGENT_A1"

AGENT_A2=$(register "  Summarizer Agent" POST "/api/providers/$PROVIDER_A/agents" '{
  "name": "Summarizer Agent",
  "description": "Condenses long text into key points",
  "version": "2.1.0",
  "capabilities": [{"name": "summarize", "description": "Summarize text", "inputSchema": {}, "outputSchema": {}}],
  "pricing": {"type": "per_invocation", "pricePerCall": {"amountCents": 5, "currency": "USD"}},
  "sla": {"maxLatencyMs": 3000, "uptimePercentage": 99.5, "maxErrorRate": 0.02},
  "supportsStreaming": true
}' "['data']['agent']['id']")
activate agents "$AGENT_A2"

# ── Provider B: Vision Co ─────────────────────

printf "\n${BOLD}Provider B — Vision Co${RESET}\n" >&2
PROVIDER_B=$(register "Vision Co" POST "/api/providers" '{
  "name": "Vision Co",
  "description": "Computer vision and image analysis",
  "contactEmail": "api@visionco.example",
  "webhookUrl": "http://localhost:4200"
}' "['data']['provider']['id']")
activate providers "$PROVIDER_B"

AGENT_B1=$(register "  Image Classifier" POST "/api/providers/$PROVIDER_B/agents" '{
  "name": "Image Classifier",
  "description": "Classifies images into categories",
  "version": "3.0.0",
  "capabilities": [{"name": "classify", "description": "Classify images", "inputSchema": {}, "outputSchema": {}}],
  "pricing": {"type": "per_invocation", "pricePerCall": {"amountCents": 10, "currency": "USD"}},
  "sla": {"maxLatencyMs": 2000, "uptimePercentage": 99.0, "maxErrorRate": 0.05},
  "supportsStreaming": false
}' "['data']['agent']['id']")
activate agents "$AGENT_B1"

AGENT_B2=$(register "  OCR Agent" POST "/api/providers/$PROVIDER_B/agents" '{
  "name": "OCR Agent",
  "description": "Extracts text from images and documents",
  "version": "1.4.0",
  "capabilities": [{"name": "ocr", "description": "Extract text from images", "inputSchema": {}, "outputSchema": {}}],
  "pricing": {"type": "per_invocation", "pricePerCall": {"amountCents": 8, "currency": "USD"}},
  "sla": {"maxLatencyMs": 5000, "uptimePercentage": 99.0, "maxErrorRate": 0.03},
  "supportsStreaming": false
}' "['data']['agent']['id']")
activate agents "$AGENT_B2"

# ── Provider C: Code Forge ────────────────────

printf "\n${BOLD}Provider C — Code Forge${RESET}\n" >&2
PROVIDER_C=$(register "Code Forge" POST "/api/providers" '{
  "name": "Code Forge",
  "description": "Code generation and analysis tools",
  "contactEmail": "dev@codeforge.example",
  "webhookUrl": "http://localhost:4300"
}' "['data']['provider']['id']")
activate providers "$PROVIDER_C"

AGENT_C1=$(register "  Code Review Agent" POST "/api/providers/$PROVIDER_C/agents" '{
  "name": "Code Review Agent",
  "description": "Analyzes code for bugs and style issues",
  "version": "1.0.0",
  "capabilities": [{"name": "review", "description": "Review code", "inputSchema": {}, "outputSchema": {}}],
  "pricing": {"type": "per_invocation", "pricePerCall": {"amountCents": 15, "currency": "USD"}},
  "sla": {"maxLatencyMs": 10000, "uptimePercentage": 99.5, "maxErrorRate": 0.01},
  "supportsStreaming": true
}' "['data']['agent']['id']")
activate agents "$AGENT_C1"

AGENT_C2=$(register "  Flaky Agent" POST "/api/providers/$PROVIDER_C/agents" '{
  "name": "Flaky Agent",
  "description": "Intentionally unreliable — tests circuit breaker behavior",
  "version": "0.1.0",
  "capabilities": [{"name": "flake", "description": "Fails randomly", "inputSchema": {}, "outputSchema": {}}],
  "pricing": {"type": "per_invocation", "pricePerCall": {"amountCents": 1, "currency": "USD"}},
  "sla": {"maxLatencyMs": 1000, "uptimePercentage": 50.0, "maxErrorRate": 0.50},
  "supportsStreaming": false
}' "['data']['agent']['id']")
activate agents "$AGENT_C2"

# ── Summary ───────────────────────────────────

cat >&2 <<EOF

────────────────────────────────────────────
$(printf "${BOLD}IDs for manual coordination (step 4):${RESET}")

  $(printf "${DIM}Consumer:${RESET}")    $(printf "${BOLD}${CONSUMER_ID}${RESET}")

  $(printf "${DIM}NLP Labs:${RESET}")    Echo Agent        $(printf "${BOLD}${AGENT_A1}${RESET}")
               Summarizer Agent  $(printf "${BOLD}${AGENT_A2}${RESET}")

  $(printf "${DIM}Vision Co:${RESET}")   Image Classifier  $(printf "${BOLD}${AGENT_B1}${RESET}")
               OCR Agent         $(printf "${BOLD}${AGENT_B2}${RESET}")

  $(printf "${DIM}Code Forge:${RESET}")  Code Review Agent $(printf "${BOLD}${AGENT_C1}${RESET}")
               Flaky Agent       $(printf "${BOLD}${AGENT_C2}${RESET}")

$(printf "${DIM}Example coordination:${RESET}")
  curl -X POST ${BASE}/api/coordinations \\
    -H "Content-Type: application/json" \\
    -d '{
      "consumerId": "${CONSUMER_ID}",
      "agentId": "${AGENT_A1}",
      "input": {"message": "hello world"},
      "priority": "normal"
    }'

EOF
