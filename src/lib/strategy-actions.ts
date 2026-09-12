"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDsl, validateConditionNode, collectAuxRequirements } from "@/lib/strategy";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { ConditionNode } from "@/lib/strategy";
import type { Prisma } from "@prisma/client";

export interface StrategyInput {
  name: string;
  instrumentId: string;
  mode: "NO_CODE" | "CODE";
  entryCondition?: ConditionNode;
  exitCondition?: ConditionNode;
  entrySource?: string;
  exitSource?: string;
}

/** Cross-instrument operands (added for multi-instrument conditions) name a
 * symbol directly rather than an instrument id, so there's no foreign key
 * to lean on — this is the one check that needs a database round-trip and
 * can't live in the pure, synchronous validateConditionNode. */
async function validateReferencedInstruments(entry: ConditionNode, exit: ConditionNode): Promise<void> {
  const symbols = collectAuxRequirements(entry, exit)
    .map((req) => req.instrumentSymbol)
    .filter((s): s is string => s !== undefined);
  if (symbols.length === 0) return;

  const found = await prisma.instrument.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true } });
  const foundSymbols = new Set(found.map((i) => i.symbol));
  const missing = symbols.filter((s) => !foundSymbols.has(s));
  if (missing.length > 0) {
    throw new Error(`Unknown instrument symbol(s) referenced in conditions: ${[...new Set(missing)].join(", ")}`);
  }
}

async function compile(input: StrategyInput): Promise<{
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  entrySource: string | null;
  exitSource: string | null;
}> {
  if (!input.name.trim()) throw new Error("Strategy name is required");
  if (!input.instrumentId) throw new Error("Instrument is required");

  if (input.mode === "CODE") {
    if (!input.entrySource?.trim() || !input.exitSource?.trim()) {
      throw new Error("Entry and exit code are required");
    }
    const entryCondition = parseDsl(input.entrySource);
    const exitCondition = parseDsl(input.exitSource);
    await validateReferencedInstruments(entryCondition, exitCondition);
    return {
      entryCondition,
      exitCondition,
      entrySource: input.entrySource,
      exitSource: input.exitSource,
    };
  }

  if (!input.entryCondition || !input.exitCondition) {
    throw new Error("Entry and exit conditions are required");
  }
  validateConditionNode(input.entryCondition, "entryCondition");
  validateConditionNode(input.exitCondition, "exitCondition");
  await validateReferencedInstruments(input.entryCondition, input.exitCondition);
  return {
    entryCondition: input.entryCondition,
    exitCondition: input.exitCondition,
    entrySource: null,
    exitSource: null,
  };
}

export async function createStrategy(input: StrategyInput) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await enforceRateLimit(`strategy-write:${session.user.id}`, 30, 60_000);

  const compiled = await compile(input);

  const strategy = await prisma.strategy.create({
    data: {
      userId: session.user.id,
      instrumentId: input.instrumentId,
      name: input.name.trim(),
      mode: input.mode,
      entryCondition: compiled.entryCondition as unknown as Prisma.InputJsonValue,
      exitCondition: compiled.exitCondition as unknown as Prisma.InputJsonValue,
      entrySource: compiled.entrySource,
      exitSource: compiled.exitSource,
    },
  });

  revalidatePath("/app/strategies");
  redirect(`/app/strategies/${strategy.id}`);
}

export async function updateStrategy(id: string, input: StrategyInput) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await enforceRateLimit(`strategy-write:${session.user.id}`, 30, 60_000);

  const compiled = await compile(input);

  await prisma.strategy.updateMany({
    where: { id, userId: session.user.id },
    data: {
      instrumentId: input.instrumentId,
      name: input.name.trim(),
      mode: input.mode,
      entryCondition: compiled.entryCondition as unknown as Prisma.InputJsonValue,
      exitCondition: compiled.exitCondition as unknown as Prisma.InputJsonValue,
      entrySource: compiled.entrySource,
      exitSource: compiled.exitSource,
    },
  });

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
}

export async function setStrategyStatus(id: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.strategy.updateMany({
    where: { id, userId: session.user.id },
    data: { status },
  });

  revalidatePath("/app/strategies");
  revalidatePath(`/app/strategies/${id}`);
  revalidatePath("/app/dashboard");
}

export async function deleteStrategy(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.strategy.deleteMany({
    where: { id, userId: session.user.id },
  });

  revalidatePath("/app/strategies");
  revalidatePath("/app/dashboard");
  redirect("/app/strategies");
}
