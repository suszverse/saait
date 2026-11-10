import { cookies } from "next/headers";
import Link from "next/link";
import { WebHeader } from "@/components/shell/web-header";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { formatRs } from "@/lib/money";
import { currentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { creditBalance } from "@/server/rewards/ledger";

/** Client desktop header; the signed-in user's saved theme wins over the device cookie. */
export async function ClientHeader() {
  const user = await currentUser();
  const theme = user ? user.theme : parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const balance = user ? await creditBalance(db(), user.id) : null;
  const creditPill =
    balance !== null && balance > 0 ? (
      <Link
        href="/rewards"
        className="inline-flex h-6.5 items-center gap-1 rounded-chip bg-teal-tint px-2.5 text-micro font-semibold whitespace-nowrap text-teal no-underline"
      >
        <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M5 12v8h14v-8M12 8v12M12 8c-2.5 0-4-1-4-2.5S9.5 3 12 8zM12 8c2.5 0 4-1 4-2.5S14.5 3 12 8z" />
        </svg>
        {formatRs(balance)} credit
      </Link>
    ) : null;
  return <WebHeader role="client" name={user?.name ?? undefined} theme={theme} signedIn={!!user} creditPill={creditPill} />;
}
