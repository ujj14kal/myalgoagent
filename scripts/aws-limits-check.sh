#!/usr/bin/env bash
# Read-only: what we use versus the AWS limits and free tiers that matter for this account. Run before and after infra changes.
# Needs the MFA session (scripts/aws-mfa-session.sh). Usage: scripts/aws-limits-check.sh
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-myalgoagent}" AWS_REGION="${AWS_REGION:-ap-south-1}"
S=$(date -u -v1d +%Y-%m-%d 2>/dev/null || date -u +%Y-%m-01); E=$(date -u -v+1d +%Y-%m-%d 2>/dev/null || date -u -d tomorrow +%Y-%m-%d)

kms=$(aws ce get-cost-and-usage --time-period Start=$S,End=$E --granularity MONTHLY --metrics UsageQuantity \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["AWS Key Management Service"]}}' --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --query "ResultsByTime[0].Groups[?contains(Keys[0],'KMS-Requests')].Metrics.UsageQuantity.Amount" --output text | cut -d. -f1)
echo "KMS requests this month : ${kms:-0} of 20000 free (then \$0.03 per 10,000 - never a hard stop)"

eips=$(aws ec2 describe-addresses --query 'length(Addresses[?ServiceManaged==`null`])' --output text)
echo "Elastic IPs (own)       : $eips of $(aws service-quotas get-service-quota --service-code ec2 --quota-code L-0263D0A3 --query Quota.Value --output text | cut -d. -f1)"
echo "VPCs                    : $(aws ec2 describe-vpcs --query 'length(Vpcs)' --output text) of $(aws service-quotas get-service-quota --service-code vpc --quota-code L-F678F1CE --query Quota.Value --output text | cut -d. -f1)"
echo "RDS instances           : $(aws rds describe-db-instances --query 'length(DBInstances)' --output text) of $(aws service-quotas get-service-quota --service-code rds --quota-code L-7B6409FD --query Quota.Value --output text | cut -d. -f1)"
vcpu=$(aws ecs describe-services --cluster myalgoagent --services myalgoagent-engine myalgoagent-web --query 'sum(services[].runningCount)' --output text)
echo "Fargate tasks running   : $vcpu (limit: $(aws service-quotas get-service-quota --service-code fargate --quota-code L-3032A538 --query Quota.Value --output text | cut -d. -f1) vCPUs; engine 0.25 + web 0.5 each, autoscaling max 4 web)"
echo "SES (sandbox)           : $(aws sesv2 get-account --query 'SendQuota.Max24HourSend' --output text | cut -d. -f1) emails/day until production access is granted"
echo "Month cost so far       : \$$(aws ce get-cost-and-usage --time-period Start=$S,End=$E --granularity MONTHLY --metrics UnblendedCost --query 'ResultsByTime[0].Total.UnblendedCost.Amount' --output text | cut -c1-6)"
