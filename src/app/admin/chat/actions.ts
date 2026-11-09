"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { clear, confirm, ModerationError } from "@/server/chat/moderation";

export type FlagState = { error?: string };
const idSchema = z.string().uuid();

/**
 * One action for both decisions; the pressed button carries the decision so
 * the row keeps a single form and a single error slot.
 */
export async function decideFlag(_prev: FlagState, form: FormData): Promise<FlagState> {
  const op = await requireRole(["operator", "admin"], "/admin/chat");
  const id = idSchema.safeParse(form.get("messageId"));
  if (!id.success) return { error: "Unknown message." };
  const decision = form.get("decision");
  if (decision !== "clear" && decision !== "confirm") return { error: "Pick a decision." };
  try {
    const operator = { id: op.id, role: op.role };
    if (decision === "clear") await clear(db(), operator, id.data);
    else await confirm(db(), operator, id.data);
  } catch (e) {
    if (e instanceof ModerationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/chat");
  return {};
}
