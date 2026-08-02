export type Language = "de" | "en" | "fr" | "it";

export type Canton = {
  code: string;
  name: Record<Language, string>;
};

export const cantons: Canton[] = [
  { code: "AG", name: { de: "Aargau", en: "Aargau", fr: "Argovie", it: "Argovia" } },
  { code: "AI", name: { de: "Appenzell Innerrhoden", en: "Appenzell Inner Rhodes", fr: "Appenzell Rhodes-Intérieures", it: "Appenzello Interno" } },
  { code: "AR", name: { de: "Appenzell Ausserrhoden", en: "Appenzell Outer Rhodes", fr: "Appenzell Rhodes-Extérieures", it: "Appenzello Esterno" } },
  { code: "BE", name: { de: "Bern", en: "Bern", fr: "Berne", it: "Berna" } },
  { code: "BL", name: { de: "Basel-Landschaft", en: "Basel-Country", fr: "Bâle-Campagne", it: "Basilea Campagna" } },
  { code: "BS", name: { de: "Basel-Stadt", en: "Basel-City", fr: "Bâle-Ville", it: "Basilea Città" } },
  { code: "FR", name: { de: "Freiburg", en: "Fribourg", fr: "Fribourg", it: "Friburgo" } },
  { code: "GE", name: { de: "Genf", en: "Geneva", fr: "Genève", it: "Ginevra" } },
  { code: "GL", name: { de: "Glarus", en: "Glarus", fr: "Glaris", it: "Glarona" } },
  { code: "GR", name: { de: "Graubünden", en: "Grisons", fr: "Grisons", it: "Grigioni" } },
  { code: "JU", name: { de: "Jura", en: "Jura", fr: "Jura", it: "Giura" } },
  { code: "LU", name: { de: "Luzern", en: "Lucerne", fr: "Lucerne", it: "Lucerna" } },
  { code: "NE", name: { de: "Neuenburg", en: "Neuchatel", fr: "Neuchâtel", it: "Neuchâtel" } },
  { code: "NW", name: { de: "Nidwalden", en: "Nidwalden", fr: "Nidwald", it: "Nidvaldo" } },
  { code: "OW", name: { de: "Obwalden", en: "Obwalden", fr: "Obwald", it: "Obvaldo" } },
  { code: "SG", name: { de: "St. Gallen", en: "St. Gallen", fr: "Saint-Gall", it: "San Gallo" } },
  { code: "SH", name: { de: "Schaffhausen", en: "Schaffhausen", fr: "Schaffhouse", it: "Sciaffusa" } },
  { code: "SO", name: { de: "Solothurn", en: "Solothurn", fr: "Soleure", it: "Soletta" } },
  { code: "SZ", name: { de: "Schwyz", en: "Schwyz", fr: "Schwytz", it: "Svitto" } },
  { code: "TG", name: { de: "Thurgau", en: "Thurgau", fr: "Thurgovie", it: "Turgovia" } },
  { code: "TI", name: { de: "Tessin", en: "Ticino", fr: "Tessin", it: "Ticino" } },
  { code: "UR", name: { de: "Uri", en: "Uri", fr: "Uri", it: "Uri" } },
  { code: "VD", name: { de: "Waadt", en: "Vaud", fr: "Vaud", it: "Vaud" } },
  { code: "VS", name: { de: "Wallis", en: "Valais", fr: "Valais", it: "Vallese" } },
  { code: "ZG", name: { de: "Zug", en: "Zug", fr: "Zoug", it: "Zugo" } },
  { code: "ZH", name: { de: "Zürich", en: "Zurich", fr: "Zurich", it: "Zurigo" } },
];

export const defaultCantonCode = "ZH";

export function getCanton(code: string) {
  return cantons.find((canton) => canton.code === code.toUpperCase());
}
