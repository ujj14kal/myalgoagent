// Liveness for the load balancer: the process is up and serving. It never touches the database, so a database blip
// cannot make the balancer pull every website task out of rotation at once.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
