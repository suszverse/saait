import { SiteHeader } from "@/components/ui";

export default function ProviderLayout({ children }: LayoutProps<"/provider">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader role="provider" active="today" />
      {children}
    </div>
  );
}
