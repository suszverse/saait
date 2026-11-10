"use client";

import { useActionState, useRef, useState } from "react";
import { sendImageAction, sendMessageAction, type ChatFormState } from "@/app/chat/[id]/actions";
import { CameraIcon, CloseIcon } from "@/components/ui";
import { PAUSED_COPY } from "./chat-bubble";

function SendIcon() {
  return (
    <svg aria-hidden="true" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12 20 4l-6 16-3-7z" />
      <path d="m11 13 9-9" />
    </svg>
  );
}

/**
 * Figma C4 composer: a labelled field and an Ink send button, plus a photo
 * control. Errors are inline in Ink, not Sindoor: on this screen Sindoor
 * belongs to "Not sent" alone. Enter sends, Shift+Enter adds a line, and an
 * open IME composition (Devanagari input) is never cut short.
 */
export function Composer({ threadId, paused: pausedOnLoad }: { threadId: string; paused: boolean }) {
  const [text, sendText, sendingText] = useActionState<ChatFormState, FormData>(sendMessageAction, {});
  const [photo, sendPhoto, sendingPhoto] = useActionState<ChatFormState, FormData>(sendImageAction, {});
  const [fileName, setFileName] = useState<string | null>(null);
  const [photoAt, setPhotoAt] = useState(photo.at);
  const fileRef = useRef<HTMLInputElement>(null);

  // A new answer from the photo action clears the chosen file (React resets the form too).
  if (photo.at !== photoAt) {
    setPhotoAt(photo.at);
    setFileName(null);
  }

  const paused = pausedOnLoad || text.paused || photo.paused;
  const errorId = `composer-error-${threadId}`;
  const photoErrorId = `composer-photo-error-${threadId}`;

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-ground px-gutter pt-3 pb-5 md:px-5">
      {paused && (
        <p role="status" className="rounded-control bg-tint px-3.5 py-2.5 text-small font-semibold text-ink">
          {PAUSED_COPY}
        </p>
      )}

      <form action={sendText} className="flex items-end gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`composer-${threadId}`} className="sr-only">
            Message
          </label>
          <textarea
            key={text.at}
            id={`composer-${threadId}`}
            name="body"
            rows={1}
            maxLength={2000}
            required
            disabled={paused}
            defaultValue={text.body}
            placeholder="Write a message"
            aria-invalid={text.error ? true : undefined}
            aria-describedby={text.error ? errorId : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="field-sizing-content max-h-40 min-h-13 w-full resize-none rounded-button border border-line bg-ground px-3.5 py-3.5 text-body leading-field text-ink outline-none placeholder:text-stone focus:border-ink focus:ring-1 focus:ring-ink focus:ring-inset disabled:bg-tint disabled:text-stone"
          />
        </div>
        <button
          type="submit"
          aria-label="Send"
          disabled={paused || sendingText}
          className="flex size-13 shrink-0 items-center justify-center rounded-button bg-ink text-ground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-disabled-text"
        >
          <SendIcon />
        </button>
      </form>
      {text.error && (
        <p id={errorId} role="alert" className="text-meta font-semibold text-ink">
          {text.error}
        </p>
      )}

      <form action={sendPhoto} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        <input
          ref={fileRef}
          id={`composer-photo-${threadId}`}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          disabled={paused}
          className="peer sr-only"
          aria-describedby={photo.error ? photoErrorId : undefined}
          onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
        />
        <label
          htmlFor={`composer-photo-${threadId}`}
          className={`flex min-h-11 items-center gap-1.5 rounded-control px-3 text-small font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-ink ${paused ? "cursor-not-allowed text-disabled-text" : "cursor-pointer text-ink hover:bg-tint"}`}
        >
          <CameraIcon size={20} />
          {fileName ? "Change photo" : "Add a photo"}
        </label>
        {fileName && (
          <>
            <span className="min-w-0 max-w-48 truncate text-meta text-stone">{fileName}</span>
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => {
                if (fileRef.current) fileRef.current.value = "";
                setFileName(null);
              }}
              className="flex size-11 items-center justify-center rounded-control text-stone hover:bg-tint"
            >
              <CloseIcon size={18} />
            </button>
            <button
              type="submit"
              disabled={paused || sendingPhoto}
              className="ml-auto inline-flex h-11 items-center rounded-control border border-ink bg-ground px-4 text-label font-bold text-ink hover:bg-tint disabled:cursor-not-allowed disabled:border-transparent disabled:bg-line disabled:text-disabled-text"
            >
              {sendingPhoto ? "Sending" : "Send photo"}
            </button>
          </>
        )}
      </form>
      {photo.error && (
        <p id={photoErrorId} role="alert" className="text-meta font-semibold text-ink">
          {photo.error}
        </p>
      )}
    </div>
  );
}
