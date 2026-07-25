import { getMap } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "population_total";

  try {
    const map = await getMap(metric);
    return Response.json(map, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("Catalog map API error", error);
    return Response.json({ error: "Der Katalog ist vorübergehend nicht verfügbar." }, { status: 503 });
  }
}