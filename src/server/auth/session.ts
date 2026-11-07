import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/env";

export type Role = "client" | "provider" | "operator" | "admin";
export type SessionData = { userId?: string; phone?: string; role?: Role; pendingPhone?: string };

function options(): SessionOptions {
  return {
    password: env().SESSION_SECRET,
    cookieName: "saait_session",
    ttl: 60 * 60 * 24 * 30,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/" },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}
