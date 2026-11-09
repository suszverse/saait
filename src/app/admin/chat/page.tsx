import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { heldQueue } from "@/server/chat/moderation";
import { FlagRow } from "./flag-row";

export const metadata: Metadata = { title: "Held messages" };

export default async function HeldMessagesPage() {
  await connection();
  // Every page checks the role itself: a layout's redirect does not stop the
  // page's own data from rendering into the response.
  await requireRole(["operator", "admin"], "/admin/chat");
  const items = await heldQueue(db());
  const appealed = items.filter((i) => i.appealed).length;
  return (
    <main className="flex flex-col gap-5 px-gutter py-7 md:px-8">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-title font-extrabold">Held messages</h1>
        <p className="text-small text-stone">
          {items.length} waiting{appealed ? ` · ${appealed} appealed` : ""} · Clear delivers the message; Confirm keeps it held and counted.
        </p>
      </header>
      <div className="max-w-[720px]">
        {items.length === 0 ? (
          <p className="rounded-card border border-line bg-ground px-4 py-3.5 text-small">Nothing held right now.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-ground">
            {items.map((i) => (
              <FlagRow key={i.id} item={i} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
