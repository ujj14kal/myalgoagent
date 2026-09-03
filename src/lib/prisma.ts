import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const rdsCaBundle = fs.readFileSync(
  path.join(process.cwd(), "certs", "rds-global-bundle.pem"),
  "utf-8",
);

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { ca: rdsCaBundle, rejectUnauthorized: true },
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
