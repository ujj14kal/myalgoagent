# AWS production-grade plan

Written 2026-10-11 from a read-only audit of account 327076610444 (ap-south-1). Updated as items finish.
Legend: ☐ to do · ◐ in progress · ☑ done · ✋ needs the owner (cannot be done from here)

## Status 2026-10-12 (cutover done, lean scope)
Live: website on Fargate behind a public load balancer (`myalgoagent.com`, `www`), engine in the private subnets, private single-AZ database `myalgoagent-db-prod` (encrypted, 14-day backups, daily AWS Backup 35 days, quarterly password rotation), NAT Gateway holding the whitelisted broker IP `13.204.125.24`, relay retired. Old database stopped with final snapshot `cutover-final-old-db-20261012`; Amplify kept (auto-build off) as the rollback. Migrations: `scripts/prod-migrate.sh status|deploy` (bastion, no laptop access). Limits: `scripts/aws-limits-check.sh`.
Chosen lean scope (owner, 2026-10-12): no WAF, Config, Inspector, Security Hub, Multi-AZ or second web task. CloudFront blocked until AWS verifies the account (templates in `infra/edge`).
Still open: delete old snapshots/buckets (owner), delete the old database and Amplify after the rollback window (about 2026-10-19), rotate the admin IAM key, SES production access, avatar bucket via CloudFront, alarms for failed DB logins and engine heartbeat, runbooks and restore drill, per-user static IP (`per-user-static-ip-design.md`).

## Where we were (audit before the work)
- RDS `myalgoagent-db-encrypted`: encrypted (AWS-managed key), SSL-forced, 7-day backups, deletion protection ON — but **publicly accessible, port 5432 open to 0.0.0.0/0**, single AZ, `db.t4g.micro`, app connects as the **master user**.
- Everything lives in the **default VPC**, public subnets only. No NAT Gateway. Broker calls leave through a single relay (13.204.125.24).
- The website runs on **Amplify** (cannot join a VPC — the root reason the database must be public). The live engine runs on Fargate (1 task).
- **SES in sandbox**. Admin IAM key 37 days old with full admin. Logs kept 90 days. CloudTrail bucket has no lifecycle.
- Good already: encryption at rest, CloudTrail (validated), GuardDuty, Access Analyzer, password policy, root MFA, alarms (site down, 5xx, RDS, cost anomaly), tamper/network/RDS-change alerts, secrets in Parameter Store (SecureString), rate limiting in DynamoDB.

## Target architecture (what "production-grade" means here)
```
Visitors ─▶ Route 53 (DNSSEC, CAA) ─▶ CloudFront + WAF + Shield Standard ─▶ ALB (only CloudFront may reach it)
                                                                   │
                      ┌────────────── dedicated VPC, 2 AZs ────────┴───────────────┐
                      │ public subnets   : ALB, NAT Gateway (EIP 13.204.125.24)    │
                      │ private subnets  : ECS Fargate web ×2+, engine, bastion    │
                      │ isolated subnets : RDS PostgreSQL Multi-AZ (no internet)   │
                      └─ VPC endpoints (S3, DynamoDB) · Flow Logs · SGs least-priv ┘
Secrets Manager (rotating DB credential) · KMS customer keys · AWS Backup (+ cross-region) · CloudWatch/X-Ray/Synthetics
Security Hub · GuardDuty · Config · Inspector · IAM Identity Center · CloudTrail · Budgets
```

## Phase A — identity, secrets, logs, alerts (no downtime)
| # | Item | Status |
|---|---|---|
| A1 | Limited database user `maa_app` for website and engine; `maa_admin` kept only for migrations | ☐ |
| A2 | Rotate the admin IAM key now; then move people to **IAM Identity Center** (SSO) and drop long-lived keys; break-glass role with MFA | ☐ |
| A3 | **KMS customer-managed keys** (rotation on) for database, S3, logs, secrets | ☐ |
| A4 | Logs kept 5 years; CloudTrail archived to cold storage after 90 days; log groups encrypted with KMS | ☐ |
| A5 | Alarms: root sign-in, IAM policy/user changes, failed DB logins, engine heartbeat stale in market hours, ECS task count | ☐ |
| A6 | **AWS Budgets**: monthly budget with 50/80/100 % alerts (replaces the $10 caps) | ☐ |
| A7 | **Security Hub** (Foundational Best Practices + CIS), **AWS Config** recorder + rules, **Inspector** (container/Lambda scanning) | ☐ |
| A8 | S3 hardening on every bucket: block public, KMS, versioning, access logs, lifecycle; avatars served through CloudFront (no public bucket reads) | ☐ |
| A9 | DynamoDB (rate limits): point-in-time recovery + deletion protection | ☐ |
| A10 | SES: **request production access** ✋ (text drafted; submitted on the owner's say-so), DKIM/SPF/DMARC verified, bounce/complaint handling via SNS | ☐ |

## Phase B — network and data foundation (built alongside the live system, then cut over)
| # | Item | Status |
|---|---|---|
| B1 | **Dedicated VPC**, 2 AZs: public / private / isolated subnets, NAT Gateway taking **13.204.125.24**, S3 + DynamoDB gateway endpoints, **VPC Flow Logs** | ☐ |
| B2 | Bastion with **SSM Session Manager only** (no open ports) so migrations and scripts reach the private database | ☐ |
| B3 | New **RDS PostgreSQL Multi-AZ** in isolated subnets, KMS-encrypted, `db.t4g.small`, Performance Insights, Enhanced Monitoring, PostgreSQL log export, 14-day backups, deletion protection; restored from a fresh snapshot at cutover | ☐ |
| B4 | **Secrets Manager** for the database credential with 90-day automatic rotation; app reloads the secret on a login failure | ☐ |
| B5 | **AWS Backup**: daily plan, 35-day retention, copy to Singapore, vault lock; prune old manual snapshots | ☐ |

## Phase C — website off Amplify onto Fargate (closes the open database)
| # | Item | Status |
|---|---|---|
| C1 | Website container (non-root, read-only filesystem), built in GitHub Actions via OIDC, pushed to ECR (immutable tags, KMS, scan on push) | ☐ |
| C2 | ECS Fargate service: ≥2 tasks over 2 AZs, CPU/request auto-scaling, deployment circuit breaker, task roles least-privilege (copy of the Amplify role: Bedrock, Polly, Transcribe, SES, S3, DynamoDB, SSM) | ☐ |
| C3 | ALB (HTTPS only, TLS 1.3 policy) + **ACM** certificates; ALB accepts traffic only from CloudFront | ☐ |
| C4 | **CloudFront** (caching for `_next/static`, real visitor IP header kept for rate limits) + **WAF** (AWS managed rules: common, bad inputs, SQL injection, IP reputation; rate-based rules) + Shield Standard | ☐ |
| C5 | **Route 53**: DNSSEC, CAA records, www redirect, health checks kept | ☐ |
| C6 | Observability: **Container Insights**, **X-Ray / Application Signals** tracing, dashboards, **Synthetics** canaries (sign-in page, public pages, API health), alarms into SNS | ☐ |
| C7 | Cutover in an after-hours window: stop writers → fresh snapshot → restore into the new VPC → point web + engine at it → DNS to CloudFront. Amplify and the old database left untouched as an instant rollback for several days | ☐ |
| C8 | Engine moved into the private subnets behind the NAT; **relay retired** | ☐ |
| C9 | Close the old database: not publicly accessible, then delete after the rollback window (final snapshot kept) | ☐ |
| C10 | CI/CD: push → tests → image → ECS rolling deploy with rollback; Amplify build retired after the window | ☐ |

## Phase D — operations and resilience
| # | Item | Status |
|---|---|---|
| D1 | Everything above as CloudFormation in the repo (`infra/`), deployable from scratch; drift detection on | ☐ |
| D2 | Runbooks in `docs/`: deploy, rollback, restore from backup (tested once), rotate secrets, engine down, database failover | ☐ |
| D3 | Restore drill: restore last night's backup into a scratch instance, check data, delete it | ☐ |
| D4 | Staging environment (small copy: 1 web task, single-AZ database, shared NAT) so changes are tried before live | ☐ |

## Decided against (for now), with the reason
- **Shield Advanced** (US$3,000/month) — Shield Standard + WAF rate limits fit this size.
- **Interface VPC endpoints** (≈ US$8.6/month each per AZ) — traffic is small enough that the NAT is cheaper.
- **Second engine task** — two engines could place the same order twice; needs a claim review first.
- **Second NAT Gateway** (≈ +US$33/month) — add once real money flows through it.
- **Per-user static IPs** — separate project; the cost per user has to be set first.

## Monthly cost (estimate, ap-south-1, on top of today's ≈ US$25–30)
| Group | ≈ US$/month |
|---|---|
| NAT Gateway + data | 40 |
| Website on Fargate (2 tasks) | 30–60 |
| Load balancer | 20 |
| CloudFront + WAF | 12–20 |
| RDS Multi-AZ `db.t4g.small` + storage + monitoring | 60 |
| Backups incl. cross-region copy | 5 |
| Security Hub + Config + Inspector + Flow Logs | 25–35 |
| KMS keys, Secrets Manager, Route 53 DNSSEC | 8 |
| Tracing, dashboards, canaries | 20–25 |
| Bastion | 3 |
| **Total new** | **≈ 225–275** |
| Staging (D4) | ≈ +40–60 |

## Rules for this work
Snapshot the database before touching it. Do anything with downtime outside market hours (09:15–15:30 IST). Verify each step before the next. Keep the previous path alive until the new one is proven. Everything is code in `infra/`, not console clicks.
