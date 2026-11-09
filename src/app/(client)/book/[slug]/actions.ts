"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth/guards";
import { BookingError, checkout } from "@/server/bookings";
import { bookingDeps } from "@/server/services";

const FIELDS = ["venue", "venueLat", "venueLng"] as const;
export type CheckoutState = { error?: string; field?: (typeof FIELDS)[number] };

export async function checkoutAction(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const slug = String(form.get("providerSlug") ?? "");
  const user = await requireUser(`/p/${slug}`);
  let to: string;
  try {
    const r = await checkout(bookingDeps(), { id: user.id, phone: user.phone }, {
      providerSlug: slug,
      packageId: form.get("packageId"),
      date: form.get("date"),
      venue: form.get("venue"),
      venueLat: form.get("venueLat"),
      venueLng: form.get("venueLng"),
      addonIds: form.getAll("addon"),
      method: form.get("method"),
    });
    to = r.redirectTo;
  } catch (e) {
    if (e instanceof ZodError) {
      const issue = e.issues[0];
      const field = FIELDS.find((f) => f === issue.path[0]);
      return { error: issue.message, field };
    }
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  redirect(to);
}
