"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { createPortal } from "react-dom";
import { LanguageProvider } from "@/lib/i18n";

const PoliticalCompassModal = dynamic(() => import("@/components/political-compass-modal").then((module) => module.PoliticalCompassModal), { ssr: false });

export function CompassLauncher({ mode = "cantons" }: { mode?: "cantons" | "municipalities" }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="knowledge-button" type="button" onClick={() => setOpen(true)}>{mode === "cantons" ? "Interaktiven Kantonskompass öffnen" : "Interaktiven Gemeindekompass öffnen"} ↗</button>
    {open && createPortal(<LanguageProvider><PoliticalCompassModal mode={mode} onClose={() => setOpen(false)} /></LanguageProvider>, document.body)}
  </>;
}
