/**
 * KCP Formel-1-Scraper
 * Quelle: Jolpica F1 API (freie Ergast-API, kein Key nötig)
 * https://api.jolpi.ca/ergast/f1/2026/races.json
 *
 * Gibt nur den Renntag (Sonntag) zurück — für ein Pub die relevanteste Session.
 */

import fetch  from 'node-fetch';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Aktuelles Jahr automatisch erkennen
const YEAR = new Date().getFullYear();

async function scrapeF1() {
  const url = `https://api.jolpi.ca/ergast/f1/${YEAR}/races.json?limit=30`;
  console.log(`Fetching: ${url}`);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'KCP-Bot/1.0 (kildare-pub-leipzig)' },
  });

  console.log(`HTTP: ${res.status}`);
  const data = await res.json();

  const races  = data?.MRData?.RaceTable?.Races ?? [];
  const events = [];
  const now    = Math.floor(Date.now() / 1000);

  console.log(`Rennen in ${YEAR}: ${races.length}`);

  for (const race of races) {
    // Renntag: race.date + race.time (UTC)
    const raceIso = `${race.date}T${race.time ?? '13:00:00Z'}`;
    const dt      = new Date(raceIso);
    const ts      = Math.floor(dt.getTime() / 1000);

    if (ts < now) continue; // vergangene Rennen überspringen

    const datum   = dt.toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/Berlin',
    });
    const uhrzeit = dt.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
    });

    const circuit  = race.Circuit?.circuitName ?? '';
    const locality = race.Circuit?.Location?.locality ?? '';
    const country  = race.Circuit?.Location?.country ?? '';
    const location = [circuit, locality, country].filter(Boolean).join(', ');

    const label = `${race.raceName} · Rennen`;

    console.log(`  ✓ ${datum} ${uhrzeit} – ${label}`);

    events.push({
      sport   : 'f1',
      liga    : 'Formel 1',
      liga_kz : 'f1',
      event   : label,
      location,
      datum,
      uhrzeit,
      iso     : dt.toISOString(),
      ts,
      round   : race.round,
    });
  }

  events.sort((a, b) => a.ts - b.ts);
  return events;
}

(async () => {
  try {
    const events = await scrapeF1();
    console.log(`\n✓ Gesamt: ${events.length} F1-Rennen`);

    const outDir  = path.join(__dirname, 'data');
    const outFile = path.join(outDir, 'f1.json');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(outFile, JSON.stringify({
      updated: new Date().toISOString(),
      source : `api.jolpi.ca/ergast/f1/${YEAR}`,
      count  : events.length,
      events,
    }, null, 2), 'utf8');

    console.log(`✓ Gespeichert: ${outFile}`);
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
})();
