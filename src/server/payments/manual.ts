import { z } from "zod";
import { signatureOk, type PaymentGateway } from "./index";

const webhook = z.object({ gatewayRef: z.string().regex(/^MAN-[0-9a-f-]{36}$/), amount: z.number().int().positive(), status: z.enum(["succeeded", "failed"]) });

/**
 * Manual transfer to the company wallet. The pay page shows instructions;
 * an operator (or, outside production, the simulator) posts the signed
 * confirmation to /api/payments/manual/webhook.
 */
export function manualGateway(secret: string): PaymentGateway {
  return {
    name: "manual",
    async start(p) {
      return { gatewayRef: `MAN-${p.paymentId}`, redirectTo: `/bookings/${p.bookingCode}/pay` };
    },
    verifyWebhook(body, signature) {
      if (!signatureOk(secret, body, signature)) return null;
      try {
        const parsed = webhook.safeParse(JSON.parse(body));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}
