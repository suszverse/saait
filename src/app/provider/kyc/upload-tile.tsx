"use client";

import { useActionState, useRef, useState } from "react";
import { CameraIcon, CheckIcon } from "@/components/ui";
import { uploadAction, type KycFormState } from "./actions";

/**
 * One document slot. Uses the platform file picker with the camera hint, so
 * phones open the camera directly. Submits on selection.
 */
export function UploadTile({ kind, label, hint, uploaded, locked, camera = "environment" }: { kind: string; label: string; hint: string; uploaded: boolean; locked: boolean; camera?: "user" | "environment" }) {
  const [state, action, pending] = useActionState(uploadAction, {} as KycFormState);
  const form = useRef<HTMLFormElement>(null);
  const done = uploaded || state.ok;
  const id = `file-${kind}`;
  const [tooBig, setTooBig] = useState(false);
  // Check size before sending: the server refuses anything over 8 MB anyway,
  // but this way the provider gets a clear message instead of a failed upload.
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size > 8 * 1024 * 1024) {
      setTooBig(true);
      e.target.value = "";
      return;
    }
    setTooBig(false);
    form.current?.requestSubmit();
  };
  const error = tooBig ? "That file is over 8 MB. Take the photo again at a lower size." : state.error;
  return (
    <form ref={form} action={action} className="flex min-w-0 flex-col gap-1.5">
      <input type="hidden" name="kind" value={kind} />
      <span className="text-small font-semibold">{label}</span>
      {done ? (
        <div className="relative aspect-[3/2] overflow-hidden rounded-button bg-tint">
          <span className="absolute bottom-2 left-2 flex h-6 items-center gap-1 rounded-chip bg-white px-2 text-nano font-bold text-teal">
            <CheckIcon size={10} strokeWidth={3} />
            Uploaded
          </span>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`flex aspect-[3/2] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-button border-2 border-dashed border-check-border bg-white text-small font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${locked ? "pointer-events-none opacity-50" : ""}`}
        >
          <CameraIcon size={24} />
          {pending ? "Uploading" : "Take photo"}
          <input
            id={id}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            capture={camera}
            className="sr-only"
            disabled={locked || pending}
            onChange={pick}
          />
        </label>
      )}
      {done && !locked && (
        <label htmlFor={id} className="flex h-10 cursor-pointer items-center justify-center rounded-control border border-line bg-white text-small font-semibold">
          {pending ? "Uploading" : "Retake"}
          <input id={id} name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" capture={camera} className="sr-only" onChange={pick} />
        </label>
      )}
      {error ? (
        <p role="alert" className="text-micro font-normal text-sindoor">
          {error}
        </p>
      ) : (
        !done && <p className="text-micro font-normal text-stone">{hint}</p>
      )}
    </form>
  );
}
