"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";

type Result = { tone: "ok" | "held" | "error"; text: string };

const FALLBACK: Record<number, string> = {
  409: "You are at your limit. Remove one to add another.",
  413: "That file is too large. Pick a smaller one.",
  422: "We cannot use that file. Pick a JPG, PNG or MP4.",
};

/**
 * Posts the chosen file to /api/portfolio and says what happened. At the
 * limit the button is disabled and says how to free a slot.
 */
export function UploadSlot({ left, accept, noun }: { left: number; accept: string; noun: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const full = left <= 0;

  async function send(file: File) {
    setResult(null);
    setSending(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/portfolio", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { status?: string; reason?: string | null; error?: string };
      if (res.status === 201) {
        if (data.status === "approved") setResult({ tone: "ok", text: "Added." });
        else if (data.status === "held") setResult({ tone: "held", text: data.reason ? `Held: ${data.reason}` : "Held for a closer look." });
        else setResult({ tone: "ok", text: "Checking — it appears once approved." });
        startTransition(() => router.refresh());
      } else {
        setResult({ tone: "error", text: FALLBACK[res.status] ?? data.error ?? "Upload failed. Try again." });
      }
    } catch {
      setResult({ tone: "error", text: "Upload failed. Check your connection and try again." });
    } finally {
      setSending(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5 md:items-end">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Choose ${noun} to add`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
        }}
      />
      <Button type="button" variant="secondary" size="md" disabled={full || sending || busy} onClick={() => input.current?.click()}>
        {sending ? "Uploading…" : full ? "Remove one to add another" : `Add ${noun} · ${left} left`}
      </Button>
      <p role="status" aria-live="polite" className={`text-meta ${result?.tone === "error" ? "text-sindoor" : result?.tone === "held" ? "text-ink" : "text-stone"}`}>
        {result?.text}
      </p>
    </div>
  );
}
