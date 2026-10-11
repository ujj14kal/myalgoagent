import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

// The production database credential lives in AWS Secrets Manager and is rotated every 90 days (a rotation changes the
// password in the database and in the secret together). The connection pool asks for the password each time it opens a
// connection, so a rotation is picked up within TTL_MS without restarting anything.

export type DbSecret = { username: string; password: string; host: string; port: number; dbname: string };

const TTL_MS = 30_000;
let cached: { at: number; value: DbSecret } | null = null;
let inflight: Promise<DbSecret> | null = null;

export async function getDbSecret(secretId: string, force = false): Promise<DbSecret> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  inflight ??= (async () => {
    try {
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "ap-south-1" });
      const out = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
      const raw = JSON.parse(out.SecretString ?? "{}") as Partial<DbSecret>;
      if (!raw.username || !raw.password || !raw.host || !raw.dbname) throw new Error("Database secret is missing fields");
      const value: DbSecret = { username: raw.username, password: raw.password, host: raw.host, port: Number(raw.port ?? 5432), dbname: raw.dbname };
      cached = { at: Date.now(), value };
      return value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
