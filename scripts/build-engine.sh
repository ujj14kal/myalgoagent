#!/usr/bin/env bash
# Builds the live-strategy engine image without Docker or CodeBuild (see infra/engine/README.md).
#   scripts/build-engine.sh            bundle + smoke test only (no AWS needed)
#   scripts/build-engine.sh --push     also push to ECR as :latest and :<git sha>
# Used by hand and by .github/workflows/engine-release.yml.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${ENGINE_VERSION:-$(git rev-parse --short=12 HEAD)}"
WORK="$(mktemp -d)"
mkdir -p "$WORK/app/dist" "$WORK/app/certs" "$WORK/app/node_modules/.prisma" "$WORK/app/node_modules/@prisma"

npx esbuild src/worker/live-engine.ts --bundle --platform=node --target=node22 --format=cjs \
  --outfile="$WORK/app/dist/engine.js" --alias:@=./src --conditions=react-server \
  --external:@prisma/client --external:pg-native --define:process.env.ENGINE_VERSION="\"$VERSION\""
cp certs/rds-global-bundle.pem "$WORK/app/certs/"
cp -R node_modules/.prisma/. "$WORK/app/node_modules/.prisma/"
cp -R node_modules/@prisma/client "$WORK/app/node_modules/@prisma/"
cp -R node_modules/@prisma/client-runtime-utils "$WORK/app/node_modules/@prisma/"

# Smoke test: the bundle must load, with its database client, and report its version. Nothing connects anywhere.
(cd "$WORK/app" && ENGINE_SMOKE=1 DATABASE_URL="postgresql://smoke:smoke@localhost:5432/smoke" node dist/engine.js) | tee "$WORK/smoke.txt"
grep -q "\"version\":\"$VERSION\"" "$WORK/smoke.txt" || { echo "smoke test failed: version not reported" >&2; exit 1; }

if [ "${1:-}" != "--push" ]; then echo "built and smoke-tested $VERSION (not pushed)"; exit 0; fi

REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/myalgoagent-engine"
(cd "$WORK" && tar --uid 0 --gid 0 -czf layer.tar.gz app)
export DOCKER_CONFIG="$(mktemp -d)"; echo '{}' > "$DOCKER_CONFIG/config.json" # an old Docker Desktop setting breaks crane otherwise
aws ecr get-login-password --region "$REGION" | crane auth login "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com" -u AWS --password-stdin
crane --platform linux/arm64 append -b node:22-slim -f "$WORK/layer.tar.gz" -t "${REPO}:base-$VERSION"
crane mutate "${REPO}:base-$VERSION" --entrypoint node,dist/engine.js -w /app -u node -e NODE_ENV=production -e ENGINE_VERSION="$VERSION" -t "${REPO}:$VERSION"
crane tag "${REPO}:$VERSION" latest
echo "pushed $VERSION"
