import Link from "next/link";
import { cantonPages, formatDate, hasProvisionalResults, votingDates } from "@/lib/discovery";

export function SnapshotNotice() {
  return <p className="knowledge-notice">
    Gespeicherter Datenstand: Abstimmungen vom <time dateTime={votingDates[0]}>{formatDate(votingDates[0])}</time> bis zum{" "}
    <time dateTime={votingDates.at(-1)}>{formatDate(votingDates.at(-1)!)}</time>.
    {hasProvisionalResults && " Der verwendete BFS-Snapshot enthält provisorisch gekennzeichnete Resultate."}
    {" "}Neuere Abstimmungen sind erst nach einem geprüften Datenimport enthalten.
  </p>;
}

export function CantonLinks() {
  return <ul className="knowledge-canton-grid">{cantonPages.map((canton) =>
    <li key={canton.code}><Link href={`/kantone/${canton.slug}`} prefetch={false}><span>{canton.name.de}</span><small>{canton.code} · {canton.municipalities.length} Gemeinden mit Position</small></Link></li>
  )}</ul>;
}
