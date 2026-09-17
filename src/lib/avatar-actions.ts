"use server";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

export async function getAvatarUploadUrlAction(input: {
  contentType: string;
  size: number;
}): Promise<{ ok: true; uploadUrl: string; publicUrl: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const ext = AVATAR_ALLOWED_TYPES[input.contentType];
  if (!ext) return { ok: false, error: "Only PNG, JPEG, or WebP images are allowed." };
  if (input.size > AVATAR_MAX_BYTES) return { ok: false, error: "Image must be under 3MB." };

  const key = `avatars/${session.user.id}/${Date.now()}.${ext}`;
  const command = new PutObjectCommand({ Bucket: AVATAR_BUCKET, Key: key, ContentType: input.contentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  const publicUrl = `${AVATAR_PUBLIC_URL_PREFIX}${key.slice("avatars/".length)}`;

  return { ok: true, uploadUrl, publicUrl };
}

export async function saveAvatarAction(publicUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!publicUrl.startsWith(AVATAR_PUBLIC_URL_PREFIX)) return { ok: false, error: "Invalid image URL." };

  await prisma.user.update({ where: { id: session.user.id }, data: { image: publicUrl } });
  revalidatePath("/app/account");
  revalidatePath("/app/dashboard");
  return { ok: true };
}

export async function removeAvatarAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  await prisma.user.update({ where: { id: session.user.id }, data: { image: null } });
  revalidatePath("/app/account");
  revalidatePath("/app/dashboard");
  return { ok: true };
}
