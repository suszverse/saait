import QRCode from "qrcode";

/**
 * Verified payout QR for the client's booking page (design C6, "Booking
 * after lock"). Rendered only when the provider's KYC is verified and the
 * booking is confirmed or later; otherwise nothing, so the client never sees
 * an account that Saait has not checked.
 *
 * Payload is Saait's own scheme, `saait:payout;method=..;name=..;account=..;
 * booking=..`. Gateway-native payloads (eSewa / Khalti / NEPALPAY QR) that a
 * wallet app can scan and pay directly are a follow-up; this QR identifies the
 * verified account so the client can compare it against anything sent in chat.
 */

const PAYABLE = new Set(["confirmed", "in_progress", "delivered", "completed"]);

const METHOD_LABEL: Record<string, string> = { esewa: "eSewa", khalti: "Khalti", bank: "Bank transfer" };

type Props = {
  bookingCode: string;
  bookingStatus: string;
  provider: {
    kycStatus: string;
    payoutMethod: string | null;
    payoutAccountName: string | null;
    payoutAccountNumber: string | null;
  };
};

/** Last four characters shown, the rest replaced with bullets: •••• 4321. */
export function maskAccount(n: string): string {
  const compact = n.replace(/\s+/g, "");
  if (compact.length <= 4) return compact;
  return `•••• ${compact.slice(-4)}`;
}

/** Field values carry no `;` or `=` so the payload parses unambiguously. */
const field = (v: string) => v.replace(/[;=]/g, " ").trim();

export function payoutPayload(p: { method: string; name: string; account: string; booking: string }): string {
  return `saait:payout;method=${field(p.method)};name=${field(p.name)};account=${field(p.account)};booking=${field(p.booking)}`;
}

export async function PayoutQr({ bookingCode, bookingStatus, provider: p }: Props) {
  if (p.kycStatus !== "verified" || !PAYABLE.has(bookingStatus)) return null;
  if (!p.payoutMethod || !p.payoutAccountName || !p.payoutAccountNumber) return null;

  const payload = payoutPayload({ method: p.payoutMethod, name: p.payoutAccountName, account: p.payoutAccountNumber, booking: bookingCode });
  // Fixed black-on-white so the code scans in dark mode too; the SVG paints its
  // own light background, so no theme token is used for the QR itself.
  const svg = await QRCode.toString(payload, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  const method = METHOD_LABEL[p.payoutMethod] ?? p.payoutMethod;

  return (
    <section aria-labelledby="payout-qr-title" className="flex flex-col gap-3 rounded-card border border-line px-4 py-3.5 text-small">
      <h2 id="payout-qr-title" className="text-heading font-bold">
        Pay the balance only here
      </h2>
      <div
        role="img"
        aria-label={`Payout QR for ${p.payoutAccountName}, ${method}, account ending ${p.payoutAccountNumber.slice(-4)}`}
        className="mx-auto w-[200px] rounded-control overflow-hidden [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        // Our own freshly generated SVG; no user markup reaches it.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex flex-col gap-1">
        <p className="text-meta font-semibold text-teal">Verified payout account · pay the balance only here</p>
        <dl className="flex flex-col gap-1">
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Account name</dt>
            <dd className="text-right font-semibold">{p.payoutAccountName}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Account</dt>
            <dd className="font-semibold whitespace-nowrap">{maskAccount(p.payoutAccountNumber)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Method</dt>
            <dd className="font-semibold whitespace-nowrap">{method}</dd>
          </div>
        </dl>
      </div>
      <p className="text-meta text-stone">A QR sent in chat is never from Saait.</p>
    </section>
  );
}
