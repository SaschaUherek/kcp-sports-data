/**
 * KCP Dart-Scraper
 * Quelle: wheresthematch.com/live-darts-on-tv
 *
 * Struktur der Seite:
 *   <thead><tr><th class="b">Monday 6th July 2026</th>...</tr></thead>
 *   <tbody>
 *     <tr itemscope itemtype="BroadcastEvent">
 *       <td class="home-team">   ← Bild-Link zum Event
 *       <td class="fixture-details"> ← Event-Name (Link mit Text) + Location (em)
 *       <td class="start-time">  ← nur Uhrzeit "13:00"
 *       ...
 *     </tr>
 *   </tbody>
 */

import fetch  from 'node-fetch';
import * as cheerio from 'cheerio';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function toUrlDate(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Parst "Monday 6 July 2026 13:00" → Date-Objekt
 * Funktioniert mit vollen Wochentagnamen (Monday, Tuesday...) und Kurzform (Mon, Tue...)
 */
function parseWtmDate(raw) {
  if (!raw) return null;

  // &nbsp; und Ordinalzahlen-Suffix entfernen
  const cleaned = raw
    .replace(/ /g, ' ')
    .trim()
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1');

  const months = {
    January:0, February:1, March:2, April:3, May:4, June:5,
    July:6, August:7, September:8, October:9, November:10, December:11,
  };

  // Regex: optionaler Wochentag (beliebig lang), dann Tag Monat Jahr [Uhrzeit]
  const m = cleaned.match(
    /(?:\w+\s+)?(\d{1,2})\s+(\w+)\s+(\d{4})(?:[\s,]+(\d{1,2}:\d{2}))?/
  );
  if (!m) return null;

  const [, day, monthName, year, time] = m;
  const monthIdx = months[monthName];
  if (monthIdx === undefined) return null;

  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(Number(year), monthIdx, Number(day), hh, mm, 0);
}

async function scrapeDarts(days = 60) {
  const today = new Date();
  const end   = new Date(today);
  end.setDate(today.getDate() + days);

  const url = `https://www.wheresthematch.com/live-darts-on-tv/?showdatestart=${toUrlDate(today)}&showdateend=${toUrlDate(end)}`;
  console.log(`Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  });

  console.log(`HTTP Status: ${res.status}`);
  const html = await res.text();
  console.log(`HTML Länge: ${html.length} Zeichen`);

  const $      = cheerio.load(html);
  const events = [];
  const now    = Math.floor(Date.now() / 1000);

  let currentDateStr = null;

  // Durch ALLE Tabellenzeilen iterieren (thead + tbody zusammen)
  $('table tr').each((_, row) => {
    const $row = $(row);

    // Datum-Header in <th class="b"> erkennen
    const $thB = $row.find('th.b');
    if ($thB.length) {
      const raw = $thB.text().replace(/ /g, ' ').trim();
      if (raw.match(/\d{4}/)) {
        currentDateStr = raw;
        console.log(`Datum-Header: "${currentDateStr}"`);
      }
      return; // weiter zur nächsten Zeile
    }

    // Event-Zeilen haben itemscope-Attribut
    if (!$row.attr('itemscope')) return;
    if (!currentDateStr) return;

    // Event-Name: Link mit echtem Text in td.fixture-details
    const eventName = $row
      .find('td.fixture-details a')
      .filter((_, a) => $(a).text().trim().length > 2)
      .first()
      .text()
      .trim();
    if (!eventName) return;

    // Uhrzeit aus td.start-time (enthält nur "13:00", kein Datum)
    const timeText = $row.find('td.start-time').text().trim();
    const time     = timeText.match(/\d{1,2}:\d{2}/) ? timeText.match(/\d{1,2}:\d{2}/)[0] : '00:00';

    // Datum + Uhrzeit kombinieren
    const fullStr = `${currentDateStr} ${time}`;
    const dt      = parseWtmDate(fullStr);
    if (!dt) {
      console.log(`  ✗ Parse fehlgeschlagen: "${fullStr}"`);
      return;
    }

    const ts = Math.floor(dt.getTime() / 1000);
    if (ts < now) return; // vergangene Events überspringen

    // Location aus em-Tag in fixture-details
    const rawLoc  = $row.find('td.fixture-details em').text().trim();
    const location = rawLoc
      .split(/\s{2,}/)                // mehrfache Leerzeichen als Trennzeichen
      .map(s => s.trim())
      .filter(s => s.length > 3 && !s.match(/\.(gif|jpg|png)/i))
      .pop() || null;

    const datum   = dt.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'short' });
    const uhrzeit = dt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });

    console.log(`  ✓ ${datum} ${uhrzeit} – ${eventName}`);

    events.push({
      sport   : 'dart',
      liga    : 'PDC Darts',
      liga_kz : 'dart',
      event   : eventName,
      location,
      datum,
      uhrzeit,
      iso     : dt.toISOString(),
      ts,
    });
  });

  // Deduplizieren (gleicher Name + gleicher Timestamp)
  const seen   = new Set();
  const unique = events.filter(e => {
    const key = `${e.event}|${e.iso}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => a.ts - b.ts);
  return unique;
}

(async () => {
  try {
    const events = await scrapeDarts(60);
    console.log(`\n✓ Gesamt: ${events.length} Events`);

    const outDir  = path.join(__dirname, 'data');
    const outFile = path.join(outDir, 'dart.json');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(outFile, JSON.stringify({
      updated: new Date().toISOString(),
      source : 'wheresthematch.com',
      count  : events.length,
      events,
    }, null, 2), 'utf8');

    console.log(`✓ Gespeichert: ${outFile}`);
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
})();
