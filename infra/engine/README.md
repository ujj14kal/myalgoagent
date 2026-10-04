# Live-strategy engine on AWS Fargate

What runs: `src/worker/live-engine.ts`, one task (ARM, 0.25 vCPU / 0.5 GB) in ECS cluster `myalgoagent`, service `myalgoagent-engine`.
It checks live strategies every 15 s in market hours and writes a heartbeat (JobRun row `engine:live`).
The every-minute Amplify job (`?only=live`, EventBridge rule `myalgoagent-live-deployments`) stands aside while the heartbeat is fresh and takes over when it stops.

Broker calls go through the existing relay (BROKER_EGRESS_URL), so brokers still see 13.204.125.24.
Phase 2 (after brokers allow IP changes): a NAT gateway in front of private subnets; the relay stays as the backup path.

## Rebuild and redeploy the image (no Docker, no CodeBuild)
CodeBuild's concurrent-build quota on this account is 0, so the image is assembled with `crane` (brew install crane):

1. Bundle: `npx esbuild src/worker/live-engine.ts --bundle --platform=node --target=node22 --format=cjs --outfile=dist-engine/engine.js --alias:@=./src --conditions=react-server --external:@prisma/client --external:pg-native`
2. Layer folder `app/` holding `dist/engine.js`, `certs/rds-global-bundle.pem`, and `node_modules/.prisma`, `node_modules/@prisma/client`, `node_modules/@prisma/client-runtime-utils` (copied from node_modules). Test it: `AWS_PROFILE=myalgoagent ENGINE_DRY_RUN=1 node app/dist/engine.js` (loads secrets and counts active strategies; checks nothing).
3. `tar --uid 0 --gid 0 -czf layer.tar.gz app`
4. `export DOCKER_CONFIG=$(mktemp -d); echo '{}' > $DOCKER_CONFIG/config.json` (an old Docker Desktop setting breaks crane otherwise)
5. `aws ecr get-login-password --region ap-south-1 | crane auth login 327076610444.dkr.ecr.ap-south-1.amazonaws.com -u AWS --password-stdin`
6. `crane --platform linux/arm64 append -b node:22-slim -f layer.tar.gz -t "${REPO}:base"` then `crane mutate "${REPO}:base" --entrypoint node,dist/engine.js -w /app -u node -e NODE_ENV=production -t "${REPO}:latest"` (use `${REPO}` in braces: zsh treats `$REPO:l` as a modifier)
7. `aws ecs update-service --cluster myalgoagent --service myalgoagent-engine --force-new-deployment`

Stack: `aws cloudformation deploy --stack-name myalgoagent-engine --template-file infra/engine/template.yaml --capabilities CAPABILITY_IAM --parameter-overrides …` (parameters are listed at the top of template.yaml).
Logs: `aws logs tail /myalgoagent/engine --since 10m`. Stop: `aws ecs update-service … --desired-count 0` (the Amplify backup takes over within ~1 minute).
