import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import FillList from "@/components/ui/fill-list";

// Development only: the dashboard's card rows with lists of very different lengths, to check that a
// long list scrolls inside its card instead of leaving the card beside it hollow. Not served in production.

const items = (n: number, label: string) => (
  <ul className="divide-y divide-black/[0.04]">
    {Array.from({ length: n }, (_, i) => (
      <li key={i} className="py-2.5 text-sm">
        {label} {i + 1}
      </li>
    ))}
  </ul>
);

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="grid gap-6 lg:grid-cols-3" data-row="a">
        <Card className="flex flex-col p-5 lg:col-span-2">
          <CardHeader title="Long list (12)" />
          <FillList className="mt-3">{items(12, "Forward test")}</FillList>
        </Card>
        <Card className="p-5">
          <CardHeader title="Short neighbour" />
          <p className="mt-3 text-sm">A gauge and a few lines of text.</p>
          <p className="mt-2 text-sm">Line two.</p>
          <p className="mt-2 text-sm">Line three.</p>
          <p className="mt-2 text-sm">Line four.</p>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-row="c">
        <Card className="flex flex-col p-5">
          <CardHeader title="Activity (8)" />
          <FillList from="md" className="mt-4">{items(8, "Event")}</FillList>
        </Card>
        <Card className="flex flex-col p-5">
          <CardHeader title="Backtests (2)" />
          <FillList from="md" className="mt-3">{items(2, "Run")}</FillList>
        </Card>
        <div className="flex flex-col gap-6 md:col-span-2 xl:col-span-1">
          <Card className="p-5">
            <CardHeader title="Broker" />
            <p className="mt-3 text-sm">Groww — connected</p>
          </Card>
          <Card className="p-5">
            <CardHeader title="Watchlist" />
            {items(5, "Stock")}
          </Card>
        </div>
      </div>
    </main>
  );
}
