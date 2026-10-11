import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { getDbSecret } from "@/lib/db-credentials";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const rdsCaBundle = fs.readFileSync(
  path.join(process.cwd(), "certs", "rds-global-bundle.pem"),
  "utf-8",
);

const ssl = { ca: rdsCaBundle, rejectUnauthorized: true };
const secretId = process.env.DB_SECRET_ID;

// On AWS the credential comes from Secrets Manager (rotated every 90 days); locally and on Amplify it is DATABASE_URL.
const adapter = secretId
  ? new PrismaPg({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: async () => (await getDbSecret(secretId)).password,
      ssl,
    })
  : new PrismaPg({ connectionString: process.env.DATABASE_URL, ssl });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
