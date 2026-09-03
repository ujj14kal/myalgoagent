import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// TEMP DIAGNOSTIC — logs env var NAMES only (never values) to CloudWatch,
// to debug why AUTH_SECRET isn't reaching the Amplify SSR runtime. Remove
// once resolved.
console.log(
  "[diag] env keys present:",
  Object.keys(process.env)
    .filter((k) => k.startsWith("AUTH_") || k.startsWith("DATABASE") || k.startsWith("NEXT_PUBLIC"))
    .sort(),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  // Vercel auto-detects itself and trusts its own host; AWS Amplify
  // doesn't get that same auto-detection, so Auth.js needs this set
  // explicitly or it throws a generic "server configuration" error.
  trustHost: true,
});
