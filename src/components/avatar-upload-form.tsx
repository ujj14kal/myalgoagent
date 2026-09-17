"use client";

import { useRef, useState } from "react";
import { getAvatarUploadUrlAction, saveAvatarAction, removeAvatarAction } from "@/lib/avatar-actions";
import { avatarInitials, AVATAR_MAX_BYTES } from "@/lib/avatar";

export default function AvatarUploadForm({
  initialImage,
  name,
  email,
}: {
  initialImage: string | null;
  name: string | null;
  email: string | null;
}) {
  const [image, setImage] = useState(initialImage);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = avatarInitials(name, email);

  async function handleFile(file: File) {
    setMessage(null);

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage({ type: "error", text: "Only PNG, JPEG, or WebP images are allowed." });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setMessage({ type: "error", text: "Image must be under 3MB." });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setBusy(true);

    try {
      const urlResult = await getAvatarUploadUrlAction({ contentType: file.type, size: file.size });
      if (!urlResult.ok) {
        setMessage({ type: "error", text: urlResult.error });
        return;
      }

      const uploadRes = await fetch(urlResult.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setMessage({ type: "error", text: "Upload failed. Please try again." });
        return;
      }

      const saveResult = await saveAvatarAction(urlResult.publicUrl);
      if (!saveResult.ok) {
        setMessage({ type: "error", text: saveResult.error });
        return;
      }

      setImage(urlResult.publicUrl);
      setMessage({ type: "ok", text: "Saved." });
    } catch {
      setMessage({ type: "error", text: "Something went wrong uploading that image." });
    } finally {
      URL.revokeObjectURL(localPreview);
      setPreview(null);
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setMessage(null);
    const result = await removeAvatarAction();
    setBusy(false);
    if (result.ok) {
      setImage(null);
      setMessage({ type: "ok", text: "Photo removed." });
    } else {
      setMessage({ type: "error", text: result.error });
    }
  }

  const shown = preview ?? image;

  return (
    <div className="flex items-center gap-4">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-lg font-semibold text-brand-primary">
          {initials}
        </span>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Change photo"}
          </button>
          {image && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="text-xs font-medium text-brand-navy/50 hover:text-brand-sell disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-brand-navy/40">PNG, JPEG, or WebP, up to 3MB.</p>
        {message && (
          <p className={`mt-1 text-xs ${message.type === "ok" ? "text-brand-buy" : "text-brand-sell"}`}>{message.text}</p>
        )}
      </div>
    </div>
  );
}
