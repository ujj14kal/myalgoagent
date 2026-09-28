// MyAlgoAgent broker egress relay.
//
// Brokers only accept order-placement calls from a static IP registered on the
// client's account. The website runs on Amplify (no fixed IP), so broker API
// calls are tunnelled through this tiny server, whose Elastic IP is the one IP
// brokers see. It is an HTTP CONNECT proxy spoken over TLS:
//   - TLS to the relay itself (our own CA, pinned by the app), so the password
//     and even the destination host are never sent in the clear;
//   - every tunnel needs the shared secret (Proxy-Authorization: Bearer …);
//   - only port 443 on an allow-listed broker API host — it can't be used as an
//     open proxy; the broker traffic inside the tunnel is end-to-end TLS the
//     relay cannot read.
// Only Node's standard library — nothing to install or patch.

import tls from "node:tls";
import net from "node:net";
import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8443);
const SECRET = process.env.PROXY_SECRET ?? "";
const ALLOW = new Set((process.env.ALLOW_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
const MAX_HEADER = 8 * 1024;
const HEADER_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 120_000;
const MAX_TUNNELS = 200;

if (SECRET.length < 32) throw new Error("PROXY_SECRET must be at least 32 characters");
if (ALLOW.size === 0) throw new Error("ALLOW_HOSTS is empty");

const digest = (s) => createHash("sha256").update(s).digest();
const SECRET_DIGEST = digest(SECRET);
const authorised = (header) => {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return !!m && timingSafeEqual(digest(m[1].trim()), SECRET_DIGEST);
};

const log = (event, meta = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...meta }));
let open = 0;

function reject(sock, status, text, meta) {
  log("rejected", { status, ...meta });
  sock.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

const server = tls.createServer(
  {
    key: readFileSync(process.env.TLS_KEY_FILE ?? "/etc/maa-egress/tls.key"),
    cert: readFileSync(process.env.TLS_CERT_FILE ?? "/etc/maa-egress/tls.crt"),
    minVersion: "TLSv1.2",
  },
  (sock) => {
    const peer = sock.remoteAddress;
    let buf = Buffer.alloc(0);
    const headerTimer = setTimeout(() => sock.destroy(), HEADER_TIMEOUT_MS);
    sock.on("error", () => {});

    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf("\r\n\r\n");
      if (end === -1) {
        if (buf.length > MAX_HEADER) {
          clearTimeout(headerTimer);
          reject(sock, 431, "Request Header Fields Too Large", { peer });
        }
        return;
      }
      sock.off("data", onData);
      clearTimeout(headerTimer);
      const [requestLine, ...lines] = buf.subarray(0, end).toString("latin1").split("\r\n");
      const rest = buf.subarray(end + 4);
      const headers = Object.fromEntries(
        lines.map((l) => {
          const i = l.indexOf(":");
          return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()];
        }),
      );
      const [method, target] = requestLine.split(" ");
      if (method !== "CONNECT") return reject(sock, 405, "Method Not Allowed", { peer, method });
      if (!authorised(headers["proxy-authorization"])) return reject(sock, 407, "Proxy Authentication Required", { peer });
      const m = /^([a-z0-9.-]+):(\d+)$/i.exec(target ?? "");
      const host = m?.[1].toLowerCase();
      if (!m || m[2] !== "443" || !ALLOW.has(host)) return reject(sock, 403, "Forbidden", { peer, target });
      if (open >= MAX_TUNNELS) return reject(sock, 503, "Service Unavailable", { peer, open });

      const upstream = net.connect(443, host);
      open++;
      const started = Date.now();
      let closed = false;
      const done = (why) => {
        if (closed) return;
        closed = true;
        open--;
        log("tunnel", { host, peer, ms: Date.now() - started, why });
        upstream.destroy();
        sock.destroy();
      };
      upstream.setTimeout(IDLE_TIMEOUT_MS, () => done("idle"));
      sock.setTimeout(IDLE_TIMEOUT_MS, () => done("idle"));
      upstream.on("error", () => done("upstream-error"));
      sock.on("close", () => done("client-closed"));
      upstream.on("close", () => done("upstream-closed"));
      upstream.on("connect", () => {
        sock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (rest.length) upstream.write(rest);
        sock.pipe(upstream);
        upstream.pipe(sock);
      });
    };
    sock.on("data", onData);
  },
);

server.on("tlsClientError", () => {});
server.listen(PORT, () => log("listening", { port: PORT, hosts: [...ALLOW] }));
