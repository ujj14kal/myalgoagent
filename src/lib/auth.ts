import NextAuth, { customFetch } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { reactivateIfPending } from "@/lib/account-status";
import { oauthFetch } from "@/lib/oauth-fetch";

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
  providers: [
    // Both providers verify email ownership themselves (Google always;
    // GitHub returns the account's verified primary email via
    // user:email scope), so it's safe to auto-link a new OAuth sign-in
    // to an existing account with the same email — without this, a user
    // who signed up with a password and later clicks "Continue with
    // Google"/"GitHub" using the same address hits Auth.js's default
    // OAuthAccountNotLinked dead end instead of just signing in.
    Google({ allowDangerousEmailAccountLinking: true, [customFetch]: oauthFetch }),
    // `repo` scope is requested up front (not just read:user/user:email) so
    // a GitHub sign-in is immediately usable for the strategy-editor's
    // "import from GitHub" feature too, without a second consent screen.
    GitHub({
      authorization: { params: { scope: "read:user user:email repo" } },
      allowDangerousEmailAccountLinking: true,
      [customFetch]: oauthFetch,
    }),
  ],
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
