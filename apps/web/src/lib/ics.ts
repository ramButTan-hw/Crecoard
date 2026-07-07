import type { CalendarEvent } from "@/store/boardStore";

// Minimal RFC 5545 .ics generation — shared by the client "Export .ics" button
// and the public subscription feed route. Standards-only, no external library.

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold long content lines to 75 octets per RFC 5545. */
export function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) { chunks.push(" " + rest.slice(0, 74)); rest = rest.slice(74); }
  return chunks.join("\r\n");
}

export function buildIcs(events: CalendarEvent[], calName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Crecoard//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    icsFold(`X-WR-CALNAME:${icsEscape(calName)}`),
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  for (const e of events) {
    const ymd = e.date.replace(/-/g, "");
    lines.push("BEGIN:VEVENT");
    lines.push(icsFold(`UID:${icsEscape(e.id)}@crecoard`));
    lines.push(`DTSTAMP:${stamp}`);
    if (e.allDay || !e.startTime) {
      lines.push(`DTSTART;VALUE=DATE:${ymd}`);
    } else {
      lines.push(`DTSTART:${ymd}T${e.startTime.replace(":", "")}00`);
      if (e.endTime) lines.push(`DTEND:${ymd}T${e.endTime.replace(":", "")}00`);
    }
    lines.push(icsFold(`SUMMARY:${icsEscape(e.title)}`));
    if (e.description) lines.push(icsFold(`DESCRIPTION:${icsEscape(e.description)}`));
    if (e.location) lines.push(icsFold(`LOCATION:${icsEscape(e.location)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
