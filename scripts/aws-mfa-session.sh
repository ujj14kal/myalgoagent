#!/usr/bin/env bash
# Short-lived AWS credentials for day-to-day work (12 hours), unlocked with
# your MFA code. The long-term key in profile "myalgoagent-admin" can only
# request these — on its own it can do nothing else.
#
#   ./scripts/aws-mfa-session.sh 123456
#
# Writes profile "myalgoagent" in ~/.aws/credentials; use it with
# AWS_PROFILE=myalgoagent (or --profile myalgoagent).
set -euo pipefail
CODE="${1:-}"
if [[ ! "$CODE" =~ ^[0-9]{6}$ ]]; then read -r -p "MFA code from your authenticator app: " CODE; fi
SERIAL=$(aws iam list-mfa-devices --profile myalgoagent-admin --user-name myalgoagent-admin --query 'MFADevices[0].SerialNumber' --output text)
if [[ -z "$SERIAL" || "$SERIAL" == "None" ]]; then echo "No MFA device on myalgoagent-admin yet — add one in the AWS console first." >&2; exit 1; fi
read -r AKID SECRET TOKEN EXP < <(aws sts get-session-token --profile myalgoagent-admin --serial-number "$SERIAL" --token-code "$CODE" --duration-seconds 43200 \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken,Expiration]' --output text)
aws configure set aws_access_key_id "$AKID" --profile myalgoagent
aws configure set aws_secret_access_key "$SECRET" --profile myalgoagent
aws configure set aws_session_token "$TOKEN" --profile myalgoagent
aws configure set region ap-south-1 --profile myalgoagent
echo "Profile \"myalgoagent\" is ready until $EXP."
