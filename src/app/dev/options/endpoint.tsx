"use client";

import { ChainEndpoint } from "@/components/options/use-chain";

export default function DevChainEndpoint({ children }: { children: React.ReactNode }) {
  return <ChainEndpoint.Provider value="/api/dev/options-chain">{children}</ChainEndpoint.Provider>;
}
