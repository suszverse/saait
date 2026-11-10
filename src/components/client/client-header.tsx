import { cookies } from "next/headers";
import { WebHeader } from "@/components/shell/web-header";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { currentUser } from "@/server/auth/guards";

/** Client desktop header; the signed-in user's saved theme wins over the device cookie. */
export async function ClientHeader() {
  const user = await currentUser();
  const theme = user ? user.theme : parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <WebHeader role="client" name={user?.name ?? undefined} theme={theme} signedIn={!!user} />;
}
