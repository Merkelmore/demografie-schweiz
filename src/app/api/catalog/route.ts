import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const canton = searchParams.get("canton") ?? "ZH";
  const municipality = searchParams.get("municipality");
  const metric = searchParams.get("metric") ?? "population_total";

  try {
    const catalog = await getCatalog(canton, municipality, metric);
    if (!catalog) return Response.json({ error: "Unbekannte oder nicht aktuelle Geografie." }, { status: 404 });
    return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Catalog API error", error);
    return Response.json({ error: "Der Katalog ist vorübergehend nicht verfügbar." }, { status: 503 });
  }
}