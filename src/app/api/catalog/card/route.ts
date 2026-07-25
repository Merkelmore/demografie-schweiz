import { getCantonCard } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const canton = searchParams.get("canton") ?? "ZH";

  try {
    const card = await getCantonCard(canton);
    if (!card) return Response.json({ error: "Unbekannter oder nicht aktueller Kanton." }, { status: 404 });
    return Response.json(card, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("Catalog card API error", error);
    return Response.json({ error: "Der Katalog ist vorübergehend nicht verfügbar." }, { status: 503 });
  }
}