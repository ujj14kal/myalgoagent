"use client";

import { CustomIndicatorsProvider, type CustomOption } from "./context";

export default function CustomIndicatorsRoot({ items, children }: { items: CustomOption[]; children: React.ReactNode }) {
  return <CustomIndicatorsProvider value={items}>{children}</CustomIndicatorsProvider>;
}
