import { sendWelcomeEmail } from "@/lib/email";
import { recordSignIn } from "@/lib/sign-in-log";
import NextAuth, { customFetch } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { reactivateIfPending } from "@/lib/account-status";
import { oauthFetch } from "@/lib/oauth-fetch";
import { isCustomAvatarUrl } from "@/lib/avatar";

// Username/password and email-magic-link sign-in are handled outside
// Auth.js's own Credentials/Email providers (see account-actions.ts and
// api/auth/magic-link/route.ts): empirically, Auth.js v5's Credentials
// provider does not persist a database Session row even with
// `session.strategy: "database"` configured — verified by testing sign-in
// end-to-end and finding zero Session rows created. Those flows instead
// verify identity themselves and create the session directly via
// createSessionForUser, the same trusted path used for passkey login.
// One active sign-in per account: a new session (Google sign-in here; password, magic link and passkey in session-cookie.ts)
// ends every other session the account has, so two browsers or devices can never be signed in at the same time.
const baseAdapter = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...baseAdapter,
  async createSession(data) {
    await prisma.session.deleteMany({ where: { userId: data.userId } });
    const created = await baseAdapter.createSession!(data);
    // Google (and any other Auth.js provider) sign-ins land here; password, magic link and passkey log in session-cookie.ts.
    await recordSignIn(data.userId, "google").catch(() => {});
    return created;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "database" },
  providers: [
    // Google verifies email ownership itself, so it's safe to auto-link a
    // new Google sign-in to an existing account with the same email —
    // without this, a user who signed up with a password and later clicks
    // "Continue with Google" using the same address hits Auth.js's default
    // OAuthAccountNotLinked dead end instead of just signing in.
    // prompt: select_account — always show Google's account chooser, so signing out and clicking "Continue with Google" never
    // slips straight back into the last account.
    Google({ allowDangerousEmailAccountLinking: true, authorization: { params: { prompt: "select_account" } }, [customFetch]: oauthFetch }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Suspended accounts can't sign in with Google either (password and
    // magic-link sign-in check this themselves).
    async signIn({ user }) {
      if (!user.email) return true;
      const existing = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() }, select: { status: true } });
      return existing?.status === "SUSPENDED" ? "/login?error=Suspended" : true;
    },
  },
  events: {
    // A brand-new account made through the adapter (Google sign-up, sign-in link): the same welcome email as a password sign-up.
    async createUser({ user }) {
      if (user.email) await sendWelcomeEmail(user.email, user.name?.trim() || "there").catch((err) => console.error("sendWelcomeEmail failed:", err));
    },
    async signIn({ user, account, profile }) {
      if (!user.id) return;
      await reactivateIfPending(user.id);

      // PrismaAdapter only sets `image` from the OAuth profile on brand-new
      // users (createUser) — a returning user who changes their Google
      // photo, or who signed up some other way and later links Google,
      // never gets it synced. Do that here on every Google sign-in, except
      // when the user has already uploaded their own custom avatar (never
      // silently overwrite a deliberate choice).
      const picture = typeof profile?.picture === "string" ? profile.picture : null;
      if (account?.provider === "google" && picture) {
        const current = await prisma.user.findUnique({ where: { id: user.id }, select: { image: true } });
        if (current && !isCustomAvatarUrl(current.image) && current.image !== picture) {
          await prisma.user.update({ where: { id: user.id }, data: { image: picture } });
        }
      }
    },
  },
  // Vercel auto-detects itself and trusts its own host; AWS Amplify
  // doesn't get that same auto-detection, so Auth.js needs this set
  // explicitly or it throws a generic "server configuration" error.
  trustHost: true,
});
