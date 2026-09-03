"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDsl, validateConditionNode } from "@/lib/strategy";
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

function compile(input: StrategyInput): {
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  entrySource: string | null;
  exitSource: string | null;
} {
  if (!input.name.trim()) throw new Error("Strategy name is required");
  if (!input.instrumentId) throw new Error("Instrument is required");

  if (input.mode === "CODE") {
    if (!input.entrySource?.trim() || !input.exitSource?.trim()) {
      throw new Error("Entry and exit code are required");
    }
    return {
      entryCondition: parseDsl(input.entrySource),
      exitCondition: parseDsl(input.exitSource),
      entrySource: input.entrySource,
      exitSource: input.exitSource,
    };
  }

  if (!input.entryCondition || !input.exitCondition) {
    throw new Error("Entry and exit conditions are required");
  }
  validateConditionNode(input.entryCondition, "entryCondition");
  validateConditionNode(input.exitCondition, "exitCondition");
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

  const compiled = compile(input);

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

  const compiled = compile(input);

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
