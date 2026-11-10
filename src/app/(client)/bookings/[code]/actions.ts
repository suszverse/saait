"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/guards";
import { BookingError, confirmBalancePaid } from "@/server/bookings";
import { db } from "@/server/db";

const codeSchema = z.string().regex(/^SA-\d{4,5}$/);

/**
 * The client marks the balance as handed to the provider. A refused confirm
 * (not theirs, wrong state) just lands back on the booking page, which shows
 * the state as it is; a repeat is a no-op.
 */
export async function markBalancePaid(form: FormData) {
  const code = codeSchema.parse(form.get("code"));
  const user = await requireUser(`/bookings/${code}`);
  try {
    await confirmBalancePaid({ db: db() }, user.id, code);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
  }
  revalidatePath(`/bookings/${code}`);
  redirect(`/bookings/${code}`);
}
