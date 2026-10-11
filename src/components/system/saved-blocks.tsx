"use client";

import { createContext, useContext } from "react";
import type { ConditionNode } from "@/lib/strategy/types";

/** The user's saved workspace blocks, offered in a strategy's rule editor ("+ Saved block"). Each is a ready-made rule. */
export type SavedBlock = { id: string; name: string; condition: ConditionNode; timeframe: string | null };

const Ctx = createContext<SavedBlock[]>([]);
export const SavedBlocksProvider = Ctx.Provider;
export const useSavedBlocks = () => useContext(Ctx);
