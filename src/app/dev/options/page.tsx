import { notFound } from "next/navigation";
import OptionsLab from "@/components/options-lab";
import DevChainEndpoint from "./endpoint";

// Development only: the Options Lab as a free-trial account sees it, without signing in. Not served in production.

export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-6xl p-4">
      <DevChainEndpoint>
        <OptionsLab />
      </DevChainEndpoint>
    </main>
  );
}
