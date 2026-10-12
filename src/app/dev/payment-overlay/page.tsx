import { notFound } from "next/navigation";
import PreviewClient from "./preview";

// Development only: the payment screens without paying. ?s=processing | plan | pro | topup | error. Not served in production.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s } = await searchParams;
  return <PreviewClient scene={s ?? "plan"} />;
}
