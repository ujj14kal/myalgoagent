// Secrets (database URL, auth secret, broker encryption key, feed login…)
// live in AWS Systems Manager Parameter Store as encrypted SecureStrings
// under /myalgoagent/app/<ENV_NAME>, and are loaded into process.env once when
// the server starts (instrumentation.ts) — so they're never written into the
// build output. A value already present in the environment wins, which keeps
// local development (.env.local) and a gradual migration working.

const DEFAULT_PATH = "/myalgoagent/app";

/** Where to read secrets from: an explicit path, or the default when running on AWS. */
function secretsPath(): string | null {
  if (process.env.APP_SECRETS_PATH) return process.env.APP_SECRETS_PATH;
  return process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV ? DEFAULT_PATH : null;
}

export async function loadRuntimeSecrets(): Promise<void> {
  const path = secretsPath();
  if (!path) return;
  try {
    const { SSMClient, GetParametersByPathCommand } = await import("@aws-sdk/client-ssm");
    const ssm = new SSMClient({ region: process.env.AWS_REGION ?? "ap-south-1" });
    let token: string | undefined;
    const loaded: string[] = [];
    do {
      const page = await ssm.send(new GetParametersByPathCommand({ Path: path, WithDecryption: true, Recursive: false, NextToken: token }));
      for (const p of page.Parameters ?? []) {
        const key = p.Name?.slice(path.length + 1);
        if (!key || !/^[A-Z][A-Z0-9_]*$/.test(key) || p.Value === undefined) continue;
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = p.Value;
          loaded.push(key);
        }
      }
      token = page.NextToken;
    } while (token);
    // Names only — never values.
    console.log(JSON.stringify({ level: "info", context: "runtime-secrets", loaded }));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", context: "runtime-secrets", message: err instanceof Error ? err.message : String(err) }));
  }
}
