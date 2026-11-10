"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/env";
import { isIsoDate } from "@/lib/nepali-date";
import { requireUser } from "@/server/auth/guards";
import { appeal, ChatError, openThread, sendImage, sendMessage } from "@/server/chat/service";
import { db } from "@/server/db";
import { getVerifiedProvider } from "@/server/providers";
import { MAX_DOCUMENT_BYTES } from "@/server/storage";
import { localEncryptedStore } from "@/server/storage/local-encrypted";

/**
 * What the composer shows after a post. `at` changes on every answer so the
 * field remounts; `body` carries the unsent text back so an error never loses it.
 */
export type ChatFormState = { error?: string; paused?: boolean; body?: string; at?: number };

const idSchema = z.string().uuid();
const slugSchema = z.string().trim().min(1).max(80);

/**
 * Service codes never reach the screen as-is; each becomes plain second-person
 * copy. A pause comes back as `paused` instead, and the composer shows its one
 * fixed line and stops sending.
 */
function describe(e: ChatError): ChatFormState {
  const at = Date.now();
  if (e.code === "paused") return { paused: true, at };
  return { error: text(e), at };
}

function text(e: ChatError): string {
  switch (e.code) {
    case "paused":
      return "";
    case "images_locked":
      return "Photos can be sent after you lock the date.";
    case "bad_input":
      return e.message;
    case "wrong_state":
      return "This message has already been delivered.";
    case "not_found":
      return "That conversation could not be found.";
    case "forbidden":
      return "You can't message this account.";
  }
}

/**
 * Opens (or finds) the conversation with a provider and lands in it. The
 * profile page posts its slug and the chosen date.
 * Signed-out visitors go to log in and come back to where they pressed.
 */
export async function openThreadAction(form: FormData): Promise<void> {
  const slug = slugSchema.safeParse(form.get("slug"));
  if (!slug.success) redirect("/chat");
  const back = `/p/${slug.data}`;
  const user = await requireUser(back);
  const provider = await getVerifiedProvider(db(), slug.data);
  if (!provider) redirect("/chat?open=not_found");
  const rawDay = form.get("date");
  const day = typeof rawDay === "string" && isIsoDate(rawDay) ? rawDay : null;

  let threadId: string;
  try {
    const t = await openThread(db(), { id: user.id, role: user.role }, { providerId: provider.id, day });
    threadId = t.id;
  } catch (e) {
    if (e instanceof ChatError) redirect(`/chat?open=${e.code}`);
    throw e;
  }
  // The slug lets the conversation's context card link back; the page re-checks it against the thread.
  redirect(`/chat/${threadId}?p=${encodeURIComponent(provider.slug)}`);
}

/** Posts one text; a held result still returns {} because the page shows it as "Not sent" with its reason. */
export async function sendMessageAction(_prev: ChatFormState, form: FormData): Promise<ChatFormState> {
  const threadId = idSchema.safeParse(form.get("threadId"));
  if (!threadId.success) return { error: "That conversation could not be found." };
  const user = await requireUser(`/chat/${threadId.data}`);
  const raw = form.get("body");
  const body = typeof raw === "string" ? raw : "";
  if (!body.trim()) return { error: "Write a message first.", at: Date.now() };
  try {
    await sendMessage(db(), { id: user.id, role: user.role }, threadId.data, body);
  } catch (e) {
    if (e instanceof ChatError) return { ...describe(e), body };
    throw e;
  }
  revalidatePath(`/chat/${threadId.data}`);
  return { at: Date.now() };
}

/** Posts one photo. Locked images come back as the inline explanation rather than a thrown error. */
export async function sendImageAction(_prev: ChatFormState, form: FormData): Promise<ChatFormState> {
  const threadId = idSchema.safeParse(form.get("threadId"));
  if (!threadId.success) return { error: "That conversation could not be found." };
  const user = await requireUser(`/chat/${threadId.data}`);
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first.", at: Date.now() };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: `That photo is over ${Math.floor(MAX_DOCUMENT_BYTES / 1_048_576)} MB. Send a smaller one.`, at: Date.now() };
  try {
    const store = localEncryptedStore(env().DOCUMENT_DIR, env().DOCUMENT_KEY);
    await sendImage(db(), { id: user.id, role: user.role }, threadId.data, { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type }, { store });
  } catch (e) {
    if (e instanceof ChatError) return describe(e);
    throw e;
  }
  revalidatePath(`/chat/${threadId.data}`);
  return { at: Date.now() };
}

/** "This isn't contact info": the sender asks our team to look at a message that was not sent. Plain form, no JS needed. */
export async function appealAction(form: FormData): Promise<void> {
  const messageId = idSchema.safeParse(form.get("messageId"));
  const threadId = idSchema.safeParse(form.get("threadId"));
  if (!messageId.success || !threadId.success) return;
  const user = await requireUser(`/chat/${threadId.data}`);
  try {
    await appeal(db(), { id: user.id, role: user.role }, messageId.data);
  } catch (e) {
    // Already appealed or no longer held: the page shows the current state either way.
    if (!(e instanceof ChatError)) throw e;
  }
  revalidatePath(`/chat/${threadId.data}`);
}
