"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { approveItem, holdItem, PortfolioError } from "@/server/portfolio";

export type ReviewState = { error?: string };
const idSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(3, "Give the provider a reason they can act on.").max(500);

/**
 * One action for both decisions; the pressed button carries the decision so
 * the row keeps a single form and a single error slot. Hold needs a reason:
 * the provider reads it next to the held item.
 */
export async function reviewItem(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const op = await requireRole(["operator", "admin"], "/admin/portfolio");
  const id = idSchema.safeParse(form.get("itemId"));
  if (!id.success) return { error: "Unknown item." };
  const decision = form.get("decision");
  if (decision !== "approve" && decision !== "hold") return { error: "Pick a decision." };
  const operator = { id: op.id, role: op.role };
  try {
    if (decision === "approve") {
      await approveItem(db(), operator, id.data);
    } else {
      const reason = reasonSchema.safeParse(form.get("reason") ?? "");
      if (!reason.success) return { error: reason.error.issues[0]?.message ?? "Give a reason." };
      await holdItem(db(), operator, id.data, reason.data);
    }
  } catch (e) {
    if (e instanceof PortfolioError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/portfolio");
  revalidatePath("/admin", "layout");
  return {};
}
