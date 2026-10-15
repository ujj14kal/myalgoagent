"use client";

import { useState } from "react";
import BlockBuilder from "@/components/custom-indicators/block-builder";

/** Development only: shows the formula the blocks hand over. */
export default function Harness() {
  const [used, setUsed] = useState<string | null>(null);
  return (
    <>
      <BlockBuilder onUse={setUsed} />
      {used !== null && (
        <pre data-testid="used" className="mt-3 rounded bg-white p-2 text-xs">
          {used}
        </pre>
      )}
    </>
  );
}
