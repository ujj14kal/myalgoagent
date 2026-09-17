// Shared constants + helpers for the user-avatar feature (S3-backed custom
// upload, Google-photo auto-sync, initials fallback). Kept in one place so
// auth.ts (sign-in sync), the upload server actions, and every UI surface
// that renders an avatar agree on the same bucket/prefix and fallback
// logic instead of quietly drifting apart.

export const AVATAR_BUCKET = "myalgoagent-user-uploads";
export const AVATAR_BUCKET_REGION = "ap-south-1";
export const AVATAR_PUBLIC_URL_PREFIX = `https://${AVATAR_BUCKET}.s3.${AVATAR_BUCKET_REGION}.amazonaws.com/avatars/`;

export const AVATAR_ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024; // 3MB

/** True for an image URL that's a user's own uploaded avatar — used so a
 * later Google sign-in doesn't silently clobber a photo the user chose
 * themselves (see the events.signIn sync in auth.ts). */
export function isCustomAvatarUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith(AVATAR_PUBLIC_URL_PREFIX);
}

/** The initials shown when there's no photo at all — first letter of up to
 * the first two words of the display name, falling back to the email. */
export function avatarInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? email ?? "").trim();
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "?";
}
