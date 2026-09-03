import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

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
