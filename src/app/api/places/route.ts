import { z } from "zod";
import { db } from "@/server/db";
import { nearestPlaces, searchPlaces } from "@/server/places";
import { NEPAL_LAT, NEPAL_LNG } from "@/server/search";

/**
 * Place picker lookups. ?q= searches the table by typed text; ?lat=&lng=
 * lists the nearest named places to a point (the "use my location" path).
 * Positions are read from the URL, answered and dropped: nothing is logged
 * or stored, and the response is never cached.
 */
const query = z.union([
  z.object({ q: z.string().trim().min(1).max(80) }),
  z.object({
    lat: z.coerce.number().min(NEPAL_LAT.min).max(NEPAL_LAT.max),
    lng: z.coerce.number().min(NEPAL_LNG.min).max(NEPAL_LNG.max),
  }),
]);

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = query.safeParse(params);
  if (!parsed.success) return Response.json({ error: "Give q (1 to 80 characters) or lat and lng inside Nepal." }, { status: 400, headers });
  const places = "q" in parsed.data ? await searchPlaces(db(), parsed.data) : await nearestPlaces(db(), parsed.data);
  return Response.json({ places }, { headers });
}
