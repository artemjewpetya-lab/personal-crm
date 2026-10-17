import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db/client";

// Checked by the deploy smoke test: 200 only when the app can reach the database.
// `version` is the commit the running image was built from.
export async function GET() {
  await connection();

  const version = process.env.APP_VERSION ?? "dev";
  const headers = { "Cache-Control": "no-store" };

  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", version }, { headers });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ status: "error", version }, { status: 503, headers });
  }
}
