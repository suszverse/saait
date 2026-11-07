import type { SmsPurpose, SmsSender } from "./index";

type LogFn = (row: { to: string; body: string; provider: string; purpose: SmsPurpose }) => Promise<void>;

/** Development sender: prints the SMS and stores it in sms_log. */
export function consoleSender(log: LogFn): SmsSender {
  return {
    name: "console",
    async send(to, body, purpose) {
      console.info(`[sms → ${to}] ${body}`);
      await log({ to, body, provider: "console", purpose });
    },
  };
}
