import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 px-gutter pt-14 pb-10">
      <Link href="/" aria-label="Back" className="-ml-3 flex size-11 items-center justify-center rounded-control">
        <ChevronLeftIcon size={22} />
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-extrabold">Sign in</h1>
        <p className="text-small text-stone">Clients, providers and the Saait team all sign in with a mobile number.</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
