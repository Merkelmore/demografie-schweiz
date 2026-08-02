export type Language = "de" | "en" | "fr" | "it" | "rm";

export type Canton = {
  code: string;
  name: Record<Language, string>;
};

export const cantons: Canton[] = [
  { code: "AG", name: { de: "Aargau", en: "Aargau", fr: "Argovie", it: "Argovia", rm: "Argovia" } },
  { code: "AI", name: { de: "Appenzell Innerrhoden", en: "Appenzell Inner Rhodes", fr: "Appenzell Rhodes-Intérieures", it: "Appenzello Interno", rm: "Appenzell Dadens" } },
  { code: "AR", name: { de: "Appenzell Ausserrhoden", en: "Appenzell Outer Rhodes", fr: "Appenzell Rhodes-Extérieures", it: "Appenzello Esterno", rm: "Appenzell Dadora" } },
  { code: "BE", name: { de: "Bern", en: "Bern", fr: "Berne", it: "Berna", rm: "Berna" } },
  { code: "BL", name: { de: "Basel-Landschaft", en: "Basel-Country", fr: "Bâle-Campagne", it: "Basilea Campagna", rm: "Basilea-Champagna" } },
  { code: "BS", name: { de: "Basel-Stadt", en: "Basel-City", fr: "Bâle-Ville", it: "Basilea Città", rm: "Basilea-Citad" } },
  { code: "FR", name: { de: "Freiburg", en: "Fribourg", fr: "Fribourg", it: "Friburgo", rm: "Friburg" } },
  { code: "GE", name: { de: "Genf", en: "Geneva", fr: "Genève", it: "Ginevra", rm: "Genevra" } },
  { code: "GL", name: { de: "Glarus", en: "Glarus", fr: "Glaris", it: "Glarona", rm: "Glaruna" } },
  { code: "GR", name: { de: "Graubünden", en: "Grisons", fr: "Grisons", it: "Grigioni", rm: "Grischun" } },
  { code: "JU", name: { de: "Jura", en: "Jura", fr: "Jura", it: "Giura", rm: "Giura" } },
  { code: "LU", name: { de: "Luzern", en: "Lucerne", fr: "Lucerne", it: "Lucerna", rm: "Lucerna" } },
  { code: "NE", name: { de: "Neuenburg", en: "Neuchatel", fr: "Neuchâtel", it: "Neuchâtel", rm: "Neuchâtel" } },
  { code: "NW", name: { de: "Nidwalden", en: "Nidwalden", fr: "Nidwald", it: "Nidvaldo", rm: "Sutsilvania" } },
  { code: "OW", name: { de: "Obwalden", en: "Obwalden", fr: "Obwald", it: "Obvaldo", rm: "Sursilvania" } },
  { code: "SG", name: { de: "St. Gallen", en: "St. Gallen", fr: "Saint-Gall", it: "San Gallo", rm: "Son Gagl" } },
  { code: "SH", name: { de: "Schaffhausen", en: "Schaffhausen", fr: "Schaffhouse", it: "Sciaffusa", rm: "Schaffusa" } },
  { code: "SO", name: { de: "Solothurn", en: "Solothurn", fr: "Soleure", it: "Soletta", rm: "Soloturn" } },
  { code: "SZ", name: { de: "Schwyz", en: "Schwyz", fr: "Schwytz", it: "Svitto", rm: "Sviz" } },
  { code: "TG", name: { de: "Thurgau", en: "Thurgau", fr: "Thurgovie", it: "Turgovia", rm: "Turgovia" } },
  { code: "TI", name: { de: "Tessin", en: "Ticino", fr: "Tessin", it: "Ticino", rm: "Tessin" } },
  { code: "UR", name: { de: "Uri", en: "Uri", fr: "Uri", it: "Uri", rm: "Uri" } },
  { code: "VD", name: { de: "Waadt", en: "Vaud", fr: "Vaud", it: "Vaud", rm: "Vad" } },
  { code: "VS", name: { de: "Wallis", en: "Valais", fr: "Valais", it: "Vallese", rm: "Vallais" } },
  { code: "ZG", name: { de: "Zug", en: "Zug", fr: "Zoug", it: "Zugo", rm: "Zug" } },
  { code: "ZH", name: { de: "Zürich", en: "Zurich", fr: "Zurich", it: "Zurigo", rm: "Turitg" } },
];

export const defaultCantonCode = "ZH";

export function getCanton(code: string) {
  return cantons.find((canton) => canton.code === code.toUpperCase());
}
