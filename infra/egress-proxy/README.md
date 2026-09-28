# Broker egress relay (static IP)

Brokers only accept order-placement API calls from a static IP registered on the
client's broker account (a SEBI rule: one IP per client unless the platform is an
NSE-empanelled algo provider). The website runs on Amplify, which has no fixed IP,
so broker API calls are tunnelled through this relay: one `t4g.nano` with one
Elastic IP (~$7/month). Today it serves **one** client account (development).

- `server.mjs`: the relay. An HTTP CONNECT proxy over TLS (our own CA), shared-secret
  auth, port 443 only, allow-listed broker hosts only. Standard library only.
- `template.yaml`: CloudFormation stack `myalgoagent-egress` (instance, EIP, security
  group, IAM role, log group `/myalgoagent/egress`, auto-recovery alarm).
- App side: `src/lib/brokers/egress.ts`. Used when `BROKER_EGRESS_URL`,
  `BROKER_EGRESS_SECRET` and `BROKER_EGRESS_CA` (base64 PEM) are set in Amplify.

Secrets live in SSM Parameter Store under `/myalgoagent/egress/` (`tls.key`,
`proxy-secret` as SecureString; `tls.crt`; `server.mjs`). The CA private key is
not stored in AWS or the repo.

## Check it
Admin portal → System & AWS → "Broker static IP" shows the IP brokers currently see.

## Fall back to Amplify-only (no relay, no fixed IP)
Remove the three `BROKER_EGRESS_*` variables from the Amplify app and redeploy.
Broker calls then go out directly (login and account checks keep working; live
orders need the relay). To also stop the cost:
`aws cloudformation delete-stack --stack-name myalgoagent-egress` (releases the IP;
a new stack gets a *different* IP, which would have to be re-registered at the broker).

## Change the relay code or secret
1. Update the SSM parameter(s) (`server.mjs` is an Advanced-tier parameter).
2. Open a shell on the instance with Session Manager (EC2 console → Connect →
   Session Manager; there's no SSH) and re-fetch + restart:
   `aws ssm get-parameter --region ap-south-1 --with-decryption --name /myalgoagent/egress/server.mjs --query Parameter.Value --output text | sudo tee /opt/maa-egress/server.mjs >/dev/null && sudo systemctl restart maa-egress`
   (for the secret, rewrite `PROXY_SECRET=` in `/etc/maa-egress/env` the same way).
   The Elastic IP stays attached throughout.
3. If the secret changed, update `BROKER_EGRESS_SECRET` in Amplify and redeploy.

## Allow a new broker host
Redeploy the stack with the host added to `AllowHosts`.
