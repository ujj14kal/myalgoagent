import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = "myalgoagent-rate-limits";
const REGION = "ap-south-1";

let client: DynamoDBClient | null = null;
function getClient(): DynamoDBClient {
  if (!client) client = new DynamoDBClient({ region: REGION });
  return client;
}

export class RateLimitError extends Error {
  constructor(message = "Too many requests — please slow down and try again in a moment.") {
    super(message);
    this.name = "RateLimitError";
  }
}

// In-memory fallback (per warm Lambda container) used only if DynamoDB is
// unreachable, so a transient AWS issue never fully disables rate limiting.
const fallbackBuckets = new Map<string, number[]>();
function enforceInMemory(key: string, maxCalls: number, windowMs: number): void {
  const now = Date.now();
  const timestamps = (fallbackBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxCalls) {
    fallbackBuckets.set(key, timestamps);
    throw new RateLimitError();
  }
  timestamps.push(now);
  fallbackBuckets.set(key, timestamps);
}

/**
 * Fixed-window rate limiter backed by DynamoDB (on-demand billing — near-$0
 * at low traffic, scales automatically at high traffic, no capacity
 * planning). Each window gets its own item (key#windowStart); DynamoDB's
 * atomic counter increment means concurrent Lambda invocations across
 * different containers still count correctly, unlike an in-memory map.
 * A TTL attribute lets DynamoDB clean up old windows for free.
 */
export async function enforceRateLimit(key: string, maxCalls: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const pk = `${key}#${windowStart}`;
  const expiresAt = Math.floor((windowStart + windowMs * 2) / 1000);

  try {
    const result = await getClient().send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: pk } },
        UpdateExpression: "ADD #c :incr SET expiresAt = :ttl",
        ExpressionAttributeNames: { "#c": "count" },
        ExpressionAttributeValues: {
          ":incr": { N: "1" },
          ":ttl": { N: expiresAt.toString() },
        },
        ReturnValues: "UPDATED_NEW",
      }),
    );

    const count = Number(result.Attributes?.count?.N ?? "0");
    if (count > maxCalls) throw new RateLimitError();
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    // DynamoDB unreachable (network blip, etc.) — fail open to the
    // best-effort in-memory limiter rather than blocking every request.
    enforceInMemory(key, maxCalls, windowMs);
  }
}
