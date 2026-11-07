"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/env";
import { requireUser } from "@/server/auth/guards";
import { bookingForClient, confirmPayment } from "@/server/bookings";
import { db } from "@/server/db";
import { sign } from "@/server/payments";
import { bookingDeps, paymentGateway } from "@/server/services";

const codeSchema = z.string().regex(/^SA-\d{4,5}$/);

/**
 * Development and test only: plays the part of eSewa calling our webhook.
 * It goes through the same signature check as a real delivery.
 */
export async function simulatePayment(form: FormData) {
  if (env().PAYMENT_SIMULATOR !== "on") throw new Error("Payment simulator is off");
  const code = codeSchema.parse(form.get("code"));
  const user = await requireUser(`/bookings/${code}`);
  const row = await bookingForClient(db(), code, user.id);
  if (!row?.pay) redirect(`/bookings/${code}`);
  const body = JSON.stringify({ gatewayRef: row.pay.gatewayRef, amount: row.pay.amount, status: "succeeded" });
  const verified = paymentGateway().verifyWebhook(body, sign(env().PAYMENT_WEBHOOK_SECRET, body));
  if (verified) await confirmPayment(bookingDeps(), verified.gatewayRef, verified.amount, verified.status);
  redirect(`/bookings/${code}`);
}
