#!/usr/bin/env bash
# Applies (or checks) database migrations on the PRIVATE production database. Your laptop cannot reach it; this runs the
# migration SQL files with psql on the SSM-only bastion, using the database owner's credential from Secrets Manager, and
# records each one in Prisma's _prisma_migrations table exactly as `prisma migrate deploy` would (same checksum).
#   scripts/prod-migrate.sh status    # which migrations are pending (read-only)
#   scripts/prod-migrate.sh deploy    # apply pending ones, each in its own transaction (snapshot first, outside market hours)
# Needs the MFA session (scripts/aws-mfa-session.sh). The bastion is started for the run and stopped afterwards
# (KEEP_BASTION=1 to leave it running).
set -euo pipefail
MODE="${1:-status}"; [ "$MODE" = status ] || [ "$MODE" = deploy ] || { echo "usage: $0 status|deploy"; exit 2; }
export AWS_PROFILE="${AWS_PROFILE:-myalgoagent}" AWS_REGION=ap-south-1
BASTION=i-0dd447aaa9c80f07f; BUCKET=myalgoagent-engine-src-327076610444; KEY="migrate/$(date +%s).tgz"
cd "$(dirname "$0")/.."

COPYFILE_DISABLE=1 tar --no-xattrs -czf /tmp/maa-migrate.tgz -C prisma migrations 2>/dev/null || COPYFILE_DISABLE=1 tar czf /tmp/maa-migrate.tgz -C prisma migrations
aws s3 cp /tmp/maa-migrate.tgz "s3://$BUCKET/$KEY" --only-show-errors

STATE=$(aws ec2 describe-instances --instance-ids $BASTION --query 'Reservations[0].Instances[0].State.Name' --output text)
if [ "$STATE" != running ]; then aws ec2 start-instances --instance-ids $BASTION >/dev/null; aws ec2 wait instance-running --instance-ids $BASTION; fi
for i in $(seq 1 40); do [ "$(aws ssm describe-instance-information --filters Key=InstanceIds,Values=$BASTION --query 'InstanceInformationList[0].PingStatus' --output text)" = Online ] && break; sleep 6; done

REMOTE=$(cat <<REMOTE_EOF
set -euo pipefail
command -v psql >/dev/null || dnf -y install postgresql17 >/dev/null 2>&1
W=\$(mktemp -d); cd \$W
aws s3 cp s3://$BUCKET/$KEY m.tgz --only-show-errors && tar xzf m.tgz
SEC=\$(aws secretsmanager get-secret-value --region ap-south-1 --secret-id myalgoagent/prod/database-admin --query SecretString --output text)
g() { echo "\$SEC" | python3 -c "import sys,json;print(json.load(sys.stdin)['\$1'])"; }
export PGPASSWORD=\$(g password) PGSSLMODE=require
P="psql -h \$(g host) -U \$(g username) -d \$(g dbname) -v ON_ERROR_STOP=1 -Atq"
pending=0
for d in migrations/*/; do
  n=\$(basename \$d); [ -f \$d/migration.sql ] || continue
  done_=\$(\$P -c "select count(*) from _prisma_migrations where migration_name='\$n' and finished_at is not null")
  if [ "\$done_" != 0 ]; then continue; fi
  pending=\$((pending+1))
  if [ "$MODE" = status ]; then echo "PENDING \$n"; continue; fi
  sum=\$(sha256sum \$d/migration.sql | cut -d' ' -f1)
  { echo "begin;"; cat \$d/migration.sql; echo; echo "insert into _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) values (gen_random_uuid()::text, '\$sum', now(), '\$n', now(), 1);"; echo "commit;"; } | \$P -f - >/dev/null
  echo "APPLIED \$n"
done
echo "applied in database: \$(\$P -c 'select count(*) from _prisma_migrations where finished_at is not null'); pending: \$pending"
REMOTE_EOF
)
CMD="echo $(echo "$REMOTE" | base64 | tr -d '\n') | base64 -d | bash"
ID=$(aws ssm send-command --instance-ids $BASTION --document-name AWS-RunShellScript --timeout-seconds 600 --parameters "commands=[\"$CMD\"]" --query Command.CommandId --output text)
ST=Pending
for i in $(seq 1 60); do ST=$(aws ssm get-command-invocation --command-id $ID --instance-id $BASTION --query Status --output text 2>/dev/null || echo Pending); case $ST in Success|Failed|TimedOut|Cancelled) break;; esac; sleep 5; done
aws ssm get-command-invocation --command-id $ID --instance-id $BASTION --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
aws s3 rm "s3://$BUCKET/$KEY" --only-show-errors || true
[ "${KEEP_BASTION:-0}" = 1 ] || aws ec2 stop-instances --instance-ids $BASTION >/dev/null
[ "$ST" = Success ]
