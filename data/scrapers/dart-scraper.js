/**
 * KCP Dart-Scraper
 * Quelle: wheresthematch.com/live-darts-on-tv
 *
 * Holt PDC-Dart-Events der nächsten 60 Tage und schreibt sie als
 * data/dart.json — im selben Format wie die Bundesliga-Daten aus spiele-fetch.php.
 *
 * Verwendung:
 *   npm install node-fetch cheerio
 *   node scrapers/dart-scraper.js
 *
 * GitHub Actions: läuft täglich automatisch (siehe .github/workflows/dart-scrape.yml)
 */

import fetch  from 'node-fetch';
import * as cheerio from 'cheerio';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -----------------------------------------------------------------------
// Hilfsfunktionen
// -----------------------------------------------------------------------

/** Formatiert ein Date-Objekt als YYYYMMDD für die URL */
function toUrlDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Parst "Mon 6th July 2026 13:00" → ISO-String "2026-07-06T13:00:00"
 * Gibt null zurück wenn das Format nicht passt.
 */
function parseWtmDate(raw) {
  if (!raw) return null;

  // Entferne Ordinalzahlen-Suffix (st, nd, rd, th)
  const cleaned = raw.trim().replace(/(\d+)(st|nd|rd|th)/, '$1');
  // cleaned: "Mon 6 July 2026 13:00"

  const months = {
    January: 0, February: 1, March: 2, April: 3,
    May: 4, June: 5, July: 6, August: 7,
    September: 8, October: 9, November: 10, December: 11,
  };

  // Regex: weekday? day month year time?
  const m = cleaned.match(
    /(?:\w{3}\s+)?(\d{1,2})\s+(\w+)\s+(\d{4})(?:\s+(\d{2}:\d{2}))?/
  );
  if (!m) return null;

  const [, day, monthName, year, time] = m;
  const monthIdx = months[monthName];
  if (monthIdx === undefined) return null;

  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const dt = new Date(Number(year), monthIdx, Number(day), hh, mm, 0);

  return dt.toISOString();
}

// -----------------------------------------------------------------------
// Scraping
// -----------------------------------------------------------------------

async function scrapeDarts(days = 60) {
  const today = new Date();
  const end   = new Date(today);
  end.setDate(today.getDate() + days);

  const url = [
    'https://www.wheresthematch.com/live-darts-on-tv/',
    `?showdatestart=${toUrlDate(today)}`,
    `&showdateend=${toUrlDate(end)}`,
  ].join('');

  console.log(`Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; KCP-Bot/1.0)',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    timeout: 15000,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} – ${res.statusText}`);
  }

  const html = await res.text();
  const $    = cheerio.load(html);

  const events = [];

  // Haupttabelle: jede <tr> mit einem Dart-Event
  $('table tr').each((_, row) => {
    const $row = $(row);

    // Event-Link (Titel)
    const titleEl = $row.find('td:nth-child(2) a').first();
    if (!titleEl.length) return; // kein Event → überspringen

    const eventName = titleEl.text().trim();
    if (!eventName) return;

    // Location / Detail (kursiver Text unter dem Titel)
    const detail = $row.find('td:nth-child(2) em, td:nth-child(2) i').text().trim();
    // Bereinige redundante Dart-Icons aus dem em-Text
    const location = detail.replace(/^\s*Darts\s*/i, '').trim();

    // Datum + Uhrzeit (4. Spalte)
    const dateText = $row.find('td:nth-child(4)').text().trim();
    const iso      = parseWtmDate(dateText);
    if (!iso) return; // kein gültiges Datum → überspringen

    const dt = new Date(iso);

    // Format wie Bundesliga: "Mon, 06. Jul" und "13:00"
    const datum   = dt.toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short',
    });
    const uhrzeit = dt.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });

    // Link zur Detailseite (für spätere Nutzung)
    const href = titleEl.attr('href') || '';
    const link = href.startsWith('http')
      ? href
      : `https://www.wheresthematch.com${href}`;

    // Broadcaster — 6. Spalte: alt-Text der Kanal-Icons oder "Log in to view"
    const broadcaster = $row.find('td:nth-child(6)').text().trim()
      .replace('Log in to view', 'PDC.TV')
      .trim();

    events.push({
      sport:    'dart',
      liga:     'PDC Darts',
      liga_kz:  'dart',
      event:    eventName,
      location: location || null,
      datum,
      uhrzeit,
      iso,
      ts:       Math.floor(dt.getTime() / 1000),
      link,
      broadcaster: broadcaster || null,
    });
  });

  // Deduplizieren (gleicher Event + gleicher iso-Timestamp)
  const seen = new Set();
  const unique = events.filter(e => {
    const key = `${e.event}|${e.iso}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Chronologisch sortieren
  unique.sort((a, b) => a.ts - b.ts);

  return unique;
}

// -----------------------------------------------------------------------
// Hauptprogramm
// -----------------------------------------------------------------------

(async () => {
  try {
    const events = await scrapeDarts(60);
    console.log(`Gefunden: ${events.length} Events`);

    const outDir  = path.join(__dirname, '..', 'data');
    const outFile = path.join(outDir, 'dart.json');

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const output = {
      updated: new Date().toISOString(),
      source:  'wheresthematch.com',
      count:   events.length,
      events,
    };

    fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
    console.log(`✓ Gespeichert: ${outFile}`);

    // Preview der ersten 3 Events
    events.slice(0, 3).forEach(e =>
      console.log(`  ${e.datum} ${e.uhrzeit} – ${e.event}`)
    );

  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
})();
