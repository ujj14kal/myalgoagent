"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export default function CopyIp({ ip }: { ip: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(ip).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/30"
    >
      <Copy size={11} /> {done ? "Copied" : "Copy"}
    </button>
  );
}
