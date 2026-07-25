export type Language = "de" | "en";

export type Canton = {
  code: string;
  name: Record<Language, string>;
};

export const cantons: Canton[] = [
  { code: "AG", name: { de: "Aargau", en: "Aargau" } },
  { code: "AI", name: { de: "Appenzell Innerrhoden", en: "Appenzell Inner Rhodes" } },
  { code: "AR", name: { de: "Appenzell Ausserrhoden", en: "Appenzell Outer Rhodes" } },
  { code: "BE", name: { de: "Bern", en: "Bern" } },
  { code: "BL", name: { de: "Basel-Landschaft", en: "Basel-Country" } },
  { code: "BS", name: { de: "Basel-Stadt", en: "Basel-City" } },
  { code: "FR", name: { de: "Freiburg", en: "Fribourg" } },
  { code: "GE", name: { de: "Genf", en: "Geneva" } },
  { code: "GL", name: { de: "Glarus", en: "Glarus" } },
  { code: "GR", name: { de: "Graubünden", en: "Grisons" } },
  { code: "JU", name: { de: "Jura", en: "Jura" } },
  { code: "LU", name: { de: "Luzern", en: "Lucerne" } },
  { code: "NE", name: { de: "Neuenburg", en: "Neuchatel" } },
  { code: "NW", name: { de: "Nidwalden", en: "Nidwalden" } },
  { code: "OW", name: { de: "Obwalden", en: "Obwalden" } },
  { code: "SG", name: { de: "St. Gallen", en: "St. Gallen" } },
  { code: "SH", name: { de: "Schaffhausen", en: "Schaffhausen" } },
  { code: "SO", name: { de: "Solothurn", en: "Solothurn" } },
  { code: "SZ", name: { de: "Schwyz", en: "Schwyz" } },
  { code: "TG", name: { de: "Thurgau", en: "Thurgau" } },
  { code: "TI", name: { de: "Tessin", en: "Ticino" } },
  { code: "UR", name: { de: "Uri", en: "Uri" } },
  { code: "VD", name: { de: "Waadt", en: "Vaud" } },
  { code: "VS", name: { de: "Wallis", en: "Valais" } },
  { code: "ZG", name: { de: "Zug", en: "Zug" } },
  { code: "ZH", name: { de: "Zürich", en: "Zurich" } },
];

export const defaultCantonCode = "ZH";

export function getCanton(code: string) {
  return cantons.find((canton) => canton.code === code.toUpperCase());
}