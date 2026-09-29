"use client";

import { createContext, useContext } from "react";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";

/** The signed-in user's custom indicators, for every indicator picker below the provider. */
export type CustomOption = { name: string; def: CustomIndicatorDef };
const Ctx = createContext<CustomOption[]>([]);
export const CustomIndicatorsProvider = Ctx.Provider;
export const useCustomIndicators = () => useContext(Ctx);
