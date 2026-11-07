import { ClientHeader } from "@/components/client/client-header";

/** Client website: desktop header on wide screens; each page adds the phone bottom nav. */
export default function ClientLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ClientHeader />
      {children}
    </div>
  );
}
