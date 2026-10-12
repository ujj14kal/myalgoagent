# Per-user static IP for paid accounts — design (2026-10-12)

Status: design for approval. Nothing here is built yet. Decision already made: **paid accounts only** (no IP at signup).

## What the user sees
- Free account: broker connections work for read-only and forward testing; no live orders, so no IP.
- On the first paid plan (or the first live broker connection on a paid plan): "Your static IP is being created" (about 2 minutes), then the IP appears on the Broker Connections screen with a one-line "add this to your broker's whitelist" note and a copy button.
- The IP never changes while the plan is active (some brokers lock whitelist edits for 7 days, Groww included).
- Cancel or downgrade: live trading stops at plan end; the IP is kept for a 30-day grace period (so re-subscribing gets the same address), then released automatically. Account deletion releases it after the existing 15-day deletion window.

## How the traffic flows
```
engine / website (private subnets) ──▶ the user's relay (private IP, port 8443, token) ──▶ broker API
                                          └─ public subnet, own Elastic IP = the user's static IP
```
Today's single relay (the shared IP, now held by the NAT Gateway) stays for free-tier and shared calls. A paid user's broker calls pick their relay instead. Only the engine and website security groups can reach a relay's port; nothing is open to the internet inbound.

## Decision: one small relay per user to start
| Option | Cost per user / month | Notes |
|---|---|---|
| **A. Dedicated `t4g.nano` relay + Elastic IP (recommended start)** | ≈ US$7.3 (instance 3.0 + IP 3.65 + disk 0.6) | Reuses the proven relay template (`infra/egress-proxy`). Full isolation per user. Simple to automate and to debug. |
| B. Shared relay fleet, ~9 IPs per `t4g.small` | ≈ US$4–5 | Cheaper, but needs extra network interfaces and source-address routing. Build only once there are 50+ paid users. |
| C. Fargate | not possible | Fargate tasks cannot hold an Elastic IP. |

Start with A behind an interface (`allocateUserEgress(userId)`), so moving to B later does not touch the app.

## Pieces to build
1. **Data:** table `UserEgress { userId (unique), allocationId, publicIp, instanceId, secretArn, status: PENDING | ACTIVE | RELEASING | RELEASED | FAILED, graceUntil, createdAt }`. One migration, applied through the bastion route.
2. **Provisioner (server code, EC2/Secrets Manager SDK):** on paid activation → allocate an Elastic IP → create a per-user relay token in Secrets Manager → launch the relay from a launch template (private-subnet-reachable, public subnet, no inbound from the internet) → associate the IP → mark ACTIVE. Every step is idempotent and retried by a scheduled job; a stuck PENDING for more than 15 minutes alerts the team.
3. **Release job (scheduled, daily):** RELEASING rows past their grace date → terminate the relay, release the IP, delete the secret.
4. **Routing:** `egressAgent(userId)` in `src/lib/brokers/egress.ts` returns that user's relay (private address plus token) when ACTIVE; shared path otherwise. Live orders for a paid user are refused with a clear message if their relay is not ACTIVE, never sent from the wrong IP.
5. **Screens:** IP card on Broker Connections, pending/failed states, support link; admin portal shows each user's IP and relay health.
6. **Monitoring:** relay health check (a daily `checkip` through each relay must equal the recorded IP), alarm on any mismatch or unreachable relay.
7. **Related features (standing rule):** agent tool and prompt (it can tell users their IP and status), tests and parity cases, privacy policy (an IP is created and stored per paid user), terms and risk pages, the data export (IP and relay status), and the broker pages' "static IP" wording.

## Limits that must be raised first (free requests)
| Limit | Now | Needed for 100 paid users |
|---|---|---|
| Elastic IPs per region | 5 | 150 |
| On-Demand Standard vCPUs (each `t4g.nano` = 2 vCPU) | 8 (bastion uses 2) | 220 |
Both can be requested in Service Quotas. Until they are approved, the provisioner caps at 3 concurrent relays and reports "capacity pending".

## Cost at scale (relays only)
| Paid users | ≈ US$/month (option A) | ≈ US$/month (option B) |
|---|---|---|
| 10 | 73 | 50 |
| 50 | 365 | 230 |
| 100 | 730 | 450 |
The IP price must be inside the plan price. Pricing is the owner's decision; at option A the floor is about ₹620 per user per month for the IP alone.

## Risks and open points
- **Capacity:** `t4g.nano` capacity was refused in one zone earlier today. The launch template will try both zones and fall back to `t4g.micro`.
- **Never recycle:** an IP is bound to one user for life of the plan plus grace. After release, AWS may hand it to anyone, so users are told to remove it from the broker whitelist when they cancel.
- **Payments don't exist yet** (Notion #26). Until they do, the provisioner is triggered by an owner-set "paid" flag on the account, so the whole path can be tested end to end.
- **No black box:** nothing here changes strategy logic visibility; it only changes which address broker calls leave from.
- **Rollback:** the feature is behind a flag; with it off every user keeps the shared IP exactly as today.

## Build order (about 3–4 working days)
1. Quota requests (today). 2. Migration + provisioner + release job with tests. 3. Routing change + refusal rule. 4. Screens + admin + monitoring. 5. Agent/legal/export updates. 6. End-to-end test with one owner-flagged test account (a real relay and IP, then release).
