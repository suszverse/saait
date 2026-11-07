import "server-only";
import { env } from "@/env";
import { db, schema as s } from "../db";
import { consoleSender } from "../sms/console";
import type { SmsSender } from "../sms";
import { createOtpService } from "./otp";

let sender: SmsSender | undefined;

export function sms(): SmsSender {
  sender ??= consoleSender(async (row) => {
    await db().insert(s.smsLog).values(row);
  });
  return sender;
}

export function otp() {
  return createOtpService({ db: db(), sms: sms(), secret: env().SESSION_SECRET });
}
