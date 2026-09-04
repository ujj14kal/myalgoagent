import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { reactivateIfPending } from "@/lib/account-status";

// Username/password and email-magic-link sign-in are handled outside
// Auth.js's own Credentials/Email providers (see account-actions.ts and
// api/auth/magic-link/route.ts): empirically, Auth.js v5's Credentials
// provider does not persist a database Session row even with
// `session.strategy: "database"` configured — verified by testing sign-in
// end-to-end and finding zero Session rows created. Those flows instead
// verify identity themselves and create the session directly via
// createSessionForUser, the same trusted path used for passkey login.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      await reactivateIfPending(user.id);
    },
  },
  // Vercel auto-detects itself and trusts its own host; AWS Amplify
  // doesn't get that same auto-detection, so Auth.js needs this set
  // explicitly or it throws a generic "server configuration" error.
  trustHost: true,
});
