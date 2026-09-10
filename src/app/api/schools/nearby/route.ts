import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";

/**
 * "Which school am I standing in?" — the first step of the sixty-second visit.
 * earth_distance over the GiST index; never a search box.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const lat = url.searchParams.get("lat")?.trim() ? Number(url.searchParams.get("lat")) : NaN;
  const lng = url.searchParams.get("lng")?.trim() ? Number(url.searchParams.get("lng")) : NaN;

  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const rows = await q(
      `SELECT id, name, village, block,
              round(earth_distance(ll_to_earth($2,$3), ll_to_earth(lat,lng))::numeric) AS distance_m
         FROM schools
        WHERE org_id = $1 AND lat IS NOT NULL AND lng IS NOT NULL
        ORDER BY ll_to_earth(lat,lng) <-> ll_to_earth($2,$3)
        LIMIT 6`,
      [user.org_id, lat, lng]
    );
    return NextResponse.json({ schools: rows, located: true });
  }

  // no fix yet — fall back to the user's block so they are never stuck
  const rows = await q(
    `SELECT id, name, village, block, NULL::numeric AS distance_m
       FROM schools
      WHERE org_id = $1 AND ($2::text IS NULL OR block = $2)
      ORDER BY name LIMIT 25`,
    [user.org_id, user.block]
  );
  return NextResponse.json({ schools: rows, located: false });
}
