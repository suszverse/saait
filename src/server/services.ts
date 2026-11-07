import "server-only";
import { env } from "@/env";
import { db } from "./db";
import { sms } from "./auth/service";
import type { BookingDeps } from "./bookings";
import { manualGateway } from "./payments/manual";
import type { PaymentGateway } from "./payments";

let gateway: PaymentGateway | undefined;

export function paymentGateway(): PaymentGateway {
  gateway ??= manualGateway(env().PAYMENT_WEBHOOK_SECRET);
  return gateway;
}

export function bookingDeps(): BookingDeps {
  return { db: db(), sms: sms(), gateway: paymentGateway() };
}
