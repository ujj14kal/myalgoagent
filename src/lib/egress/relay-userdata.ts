import { RELAY_ALLOW_HOSTS } from "./hosts";

export const RELAY_NAME = "relay.myalgoagent.internal"; // the name on every relay's own certificate
export const RELAY_PORT = 8443;
export const RELAY_CODE_PARAM = "/myalgoagent/user-egress/server.mjs";

/**
 * The boot script of one user's relay. It gets that user's secret in its launch data (readable only on the machine, over
 * the instance metadata service), makes its own certificate (the app pins it on first contact), and starts the same small
 * CONNECT proxy as infra/egress-proxy. Nothing else is installed.
 */
export function relayUserData(token: string, region = "ap-south-1"): string {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) throw new Error("relay token must be 32+ URL-safe characters");
  return `#!/bin/bash
set -euo pipefail
for i in 1 2 3 4 5 6; do dnf install -y nodejs openssl && break; sleep 10; done
mkdir -p /etc/maa-egress /opt/maa-egress
aws ssm get-parameter --region ${region} --name ${RELAY_CODE_PARAM} --query Parameter.Value --output text > /opt/maa-egress/server.mjs
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 -subj "/CN=${RELAY_NAME}" \\
  -addext "subjectAltName=DNS:${RELAY_NAME}" -keyout /etc/maa-egress/tls.key -out /etc/maa-egress/tls.crt
printf 'PROXY_SECRET=%s\\nALLOW_HOSTS=%s\\nPORT=${RELAY_PORT}\\n' '${token}' '${RELAY_ALLOW_HOSTS.join(",")}' > /etc/maa-egress/env
useradd --system --no-create-home maa-egress || true
chown -R maa-egress /etc/maa-egress /opt/maa-egress
chmod 600 /etc/maa-egress/*
cat > /etc/systemd/system/maa-egress.service <<'UNIT'
[Unit]
Description=MyAlgoAgent broker egress relay
After=network-online.target
[Service]
User=maa-egress
EnvironmentFile=/etc/maa-egress/env
ExecStart=/usr/bin/node /opt/maa-egress/server.mjs
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now maa-egress
`;
}
