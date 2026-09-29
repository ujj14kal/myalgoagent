#!/usr/bin/env bash
# Copies the app's secret environment variables from the Amplify app into
# AWS Parameter Store as encrypted SecureStrings under /myalgoagent/app/.
# Run it yourself (it prints names only, never values):
#   ./scripts/move-secrets-to-ssm.sh
set -euo pipefail
PROFILE=${AWS_PROFILE:-myalgoagent}
REGION=ap-south-1
APP=d5lc6qhib56hj
SECRETS=(AUTH_SECRET AUTH_GOOGLE_SECRET DATABASE_URL PURGE_SECRET BROKER_ENCRYPTION_KEY BROKER_EGRESS_SECRET BROKER_EGRESS_CA MARKET_DATA_TRUEDATA_USER MARKET_DATA_TRUEDATA_PASSWORD)

app_env=$(aws amplify get-app --app-id "$APP" --region "$REGION" --profile "$PROFILE" --query "app.environmentVariables" --output json)
branch_env=$(aws amplify get-branch --app-id "$APP" --branch-name main --region "$REGION" --profile "$PROFILE" --query "branch.environmentVariables" --output json)

for name in "${SECRETS[@]}"; do
  # The branch value overrides the app value, as in Amplify itself.
  value=$(python3 -c 'import json,sys; a=json.loads(sys.argv[1]) or {}; b=json.loads(sys.argv[2]) or {}; v=b.get(sys.argv[3], a.get(sys.argv[3])); print(v if v is not None else "", end="")' "$app_env" "$branch_env" "$name")
  if [ -z "$value" ]; then
    echo "skip   $name (not set in Amplify)"
    continue
  fi
  aws ssm put-parameter --name "/myalgoagent/app/$name" --type SecureString --value "$value" --overwrite --region "$REGION" --profile "$PROFILE" >/dev/null
  echo "stored $name"
done
echo "Done. Values are in Parameter Store (encrypted); nothing was printed."
