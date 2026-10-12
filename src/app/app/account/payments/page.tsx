import Link from "next/link";
import { Receipt } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import Pager from "@/components/ui/pager";
import { Card } from "@/components/ui/card";
import PaymentsTable from "@/components/billing/payments-table";
import { pageWindow, readPageQuery } from "@/lib/pagination";

export const metadata = { title: "Payments & invoices", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const sp = await searchParams;
  const total = await prisma.payment.count({ where: { userId } }).catch(() => 0);
  const { page, size } = readPageQuery(sp, 10);
  const win = pageWindow(total, page, size);
  const pays = await prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip: win.skip, take: win.take }).catch(() => []);
  const rows = pays.map((p) => ({
    id: p.id,
    when: p.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }),
    what: p.description ?? (p.kind === "topup" ? "Credit top-up" : "Plan payment"),
    amount: p.amount,
    status: p.status,
    invoice: p.invoiceNumber,
  }));
  return (
    <div>
      <PageHeader title="Payments & invoices" icon={Receipt} description="Every payment you've made through Razorpay, with its numbered invoice. Prices include GST." />
      <Card className="p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-brand-navy/55">No payments yet. <Link href="/app/checkout" className="font-semibold text-brand-primary hover:underline">Choose a plan or top up credits</Link>.</p>
        ) : (
          <>
            <PaymentsTable rows={rows} />
            <Pager basePath="/app/account/payments" window={win} />
          </>
        )}
      </Card>
    </div>
  );
}
