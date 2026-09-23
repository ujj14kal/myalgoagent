"use server";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import {
  AVATAR_BUCKET,
  AVATAR_BUCKET_REGION,
  AVATAR_PUBLIC_URL_PREFIX,
  AVATAR_ALLOWED_TYPES,
  AVATAR_MAX_BYTES,
} from "@/lib/avatar";

// Relies on the Amplify SSR compute role's own credentials (no access keys
// in env) — that role needs s3:PutObject/s3:GetObject scoped to
// myalgoagent-user-uploads/avatars/* attached before this actually works
// in production; the bucket itself, its CORS rules (PUT+GET from
// myalgoagent.com), and its public-read policy on avatars/* were already
// provisioned for exactly this feature.
const s3 = new S3Client({ region: AVATAR_BUCKET_REGION });

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function getAvatarUploadUrlAction(input: {
  contentType: string;
  size: number;
}): Promise<Result<{ uploadUrl: string; publicUrl: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`avatar-upload:${session.user.id}`, 10, 60_000);
  if (limited) return { ok: false, error: limited };

  const ext = AVATAR_ALLOWED_TYPES[input.contentType];
  if (!ext) return { ok: false, error: "Only PNG, JPEG, or WebP images are allowed." };
  // Number.isInteger + > 0: `size > MAX` alone let a negative or NaN size through.
  if (!Number.isInteger(input.size) || input.size <= 0) return { ok: false, error: "Invalid image size." };
  if (input.size > AVATAR_MAX_BYTES) return { ok: false, error: "Image must be under 3MB." };

  try {
    const key = `avatars/${session.user.id}/${Date.now()}.${ext}`;
    // ContentLength is part of the signature, so S3 rejects an upload whose
    // real size differs from the size validated above. Without it the 3MB
    // cap was purely client-honor-system: a presigned PUT accepts whatever
    // body is sent.
    const command = new PutObjectCommand({
      Bucket: AVATAR_BUCKET,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.size,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const publicUrl = `${AVATAR_PUBLIC_URL_PREFIX}${key.slice("avatars/".length)}`;
    return { ok: true, uploadUrl, publicUrl };
  } catch (err) {
    logError("avatar-actions:getAvatarUploadUrl", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't start the upload — please try again." };
  }
}

export async function saveAvatarAction(publicUrl: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`avatar-save:${session.user.id}`, 20, 60_000);
  if (limited) return { ok: false, error: limited };

  // Must be inside THIS user's own folder — a bare prefix check let anyone
  // point their avatar at any other user's uploaded image.
  const ownPrefix = `${AVATAR_PUBLIC_URL_PREFIX}${session.user.id}/`;
  if (typeof publicUrl !== "string" || publicUrl.length > 300 || !publicUrl.startsWith(ownPrefix) || publicUrl.includes("..")) {
    return { ok: false, error: "Invalid image URL." };
  }

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { image: publicUrl } });
  } catch (err) {
    logError("avatar-actions:saveAvatar", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't save your photo — please try again." };
  }
  revalidatePath("/app/account");
  revalidatePath("/app/dashboard");
  return { ok: true };
}

export async function removeAvatarAction(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const limited = await checkRateLimit(`avatar-remove:${session.user.id}`, 20, 60_000);
  if (limited) return { ok: false, error: limited };

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { image: null } });
  } catch (err) {
    logError("avatar-actions:removeAvatar", err, { userId: session.user.id });
    return { ok: false, error: "Couldn't remove your photo — please try again." };
  }
  revalidatePath("/app/account");
  revalidatePath("/app/dashboard");
  return { ok: true };
}
