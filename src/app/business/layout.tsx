import { connection } from "next/server";
import { BottomNav } from "@/components/ui/bottom-nav";
import { WebHeader } from "@/components/shell/web-header";
import { LevelBadge } from "@/components/ui/level-badge";
import { levelFor } from "@/lib/levels";
import { db } from "@/server/db";
import { lifetimePoints } from "@/server/rewards/ledger";
import { requireProviderKind } from "@/server/auth/guards";

/** Business area: WebHeader on desktop, BottomNav on phone. */
export default async function BusinessLayout({ children }: LayoutProps<"/business">) {
  await connection();
  const { user, profile } = await requireProviderKind("studio", "/business");
  const level = levelFor(await lifetimePoints(db(), user.id));
  return (
    <div className="flex min-h-dvh flex-col">
      <WebHeader role="business" name={profile.displayName} theme={user.theme} signedIn levelBadge={<LevelBadge level={level} />} />
      <div className="flex flex-1 flex-col">{children}</div>
      <BottomNav role="business" />
    </div>
  );
}
