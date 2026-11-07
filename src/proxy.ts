import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Defence in depth for the operator desk: requests to /admin are turned away
 * before any page renders unless the session cookie belongs to an operator
 * or admin. Every page and action still re-checks the role in the database;
 * this layer only guarantees that nothing reaches render without a session.
 */
export async function proxy(request: NextRequest) {
  const sealed = request.cookies.get("saait_session")?.value;
  let role: string | undefined;
  if (sealed && process.env.SESSION_SECRET) {
    try {
      role = (await unsealData<{ role?: string }>(sealed, { password: process.env.SESSION_SECRET })).role;
    } catch {
      role = undefined;
    }
  }
  if (role === "operator" || role === "admin") return NextResponse.next();
  if (!role) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
