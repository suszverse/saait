import { confirmPayment } from "@/server/bookings";
import { bookingDeps, paymentGateway } from "@/server/services";

/**
 * Gateway webhook. The raw body is verified against its HMAC signature
 * before anything is parsed; confirmation is idempotent, so redelivery is
 * safe. Only the configured gateway is accepted.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/payments/[provider]/webhook">) {
  const { provider } = await ctx.params;
  const gateway = paymentGateway();
  if (provider !== gateway.name) return Response.json({ error: "unknown gateway" }, { status: 404 });
  const body = await request.text();
  if (body.length > 10_000) return Response.json({ error: "too large" }, { status: 413 });
  const verified = gateway.verifyWebhook(body, request.headers.get("x-saait-signature"));
  if (!verified) return Response.json({ error: "bad signature" }, { status: 401 });
  const result = await confirmPayment(bookingDeps(), verified.gatewayRef, verified.amount, verified.status);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
