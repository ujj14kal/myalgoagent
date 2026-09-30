// Temporary: checks whether the host streams responses as they're produced.
export const dynamic = "force-dynamic";

export async function GET() {
  const enc = new TextEncoder();
  const t0 = Date.now();
  const stream = new ReadableStream({
    async start(c) {
      for (let i = 0; i < 5; i++) {
        c.enqueue(enc.encode(JSON.stringify({ i, at: Date.now() - t0 }) + "\n"));
        await new Promise((r) => setTimeout(r, 1000));
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
