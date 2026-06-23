/**
 * KCP Rugby-Scraper
 * Quelle: wheresthematch.com/live-rugby-union-on-tv/
 *
 * Datum + Uhrzeit kommen aus itemprop="startDate" (ISO-Format)
 * Event-Name aus itemprop="name" (z.B. "Leinster v Bulls")
 * Location aus td.fixture-details em
 *
 * Hinweis: Date-Parameter werden von WheresTheMatch für Rugby nicht unterstützt
 * → Seite ohne Parameter gibt die nächsten ~7 Tage zurück.
 */

import fetch  from 'node-fetch';
import * as cheerio from 'cheerio';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const URL_RUGBY_UNION  = 'https://www.wheresthematch.com/live-rugby-union-on-tv/';
const URL_RUGBY_LEAGUE = 'https://www.wheresthematch.com/live-rugby-league-on-tv/';

async function scrapeRugbyPage(url, liga, liga_kz) {
  console.log(`Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  });

  console.log(`HTTP: ${res.status}`);
  const html = await res.text();
  const $    = cheerio.load(html);

  const events = [];
  const now    = Math.floor(Date.now() / 1000);

  $('tr[itemscope]').each((_, row) => {
    const $row = $(row);

    // Datum + Uhrzeit aus itemprop="startDate" (ISO-String)
    const isoRaw = $row.find('[itemprop="startDate"]').attr('content');
    if (!isoRaw) return;

    const dt = new Date(isoRaw);
    if (isNaN(dt.getTime())) return;

    const ts = Math.floor(dt.getTime() / 1000);
    if (ts < now) return; // vergangene Events überspringen

    // Match-Name (z.B. "Leinster v Bulls")
    const eventName = $row.find('[itemprop="name"]').text().trim();
    if (!eventName) return;

    // Location / Wettbewerb aus fixture-details
    const emText  = $row.find('td.fixture-details em').text().trim();
    const dashIdx = emText.lastIndexOf(' - ');
    const location = dashIdx > -1
      ? emText.substring(dashIdx + 3).trim()
      : emText || null;

    // Datum + Uhrzeit auf Deutsch formatieren
    const datum   = dt.toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/Berlin',
    });
    const uhrzeit = dt.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
    });

    console.log(`  ✓ ${datum} ${uhrzeit} – ${eventName}${location ? ' @ ' + location : ''}`);

    events.push({
      sport   : 'rugby',
      liga,
      liga_kz,
      event   : eventName,
      location: location || null,
      datum,
      uhrzeit,
      iso     : dt.toISOString(),
      ts,
    });
  });

  return events;
}

(async () => {
  try {
    // Rugby Union + Rugby League zusammenführen
    const union  = await scrapeRugbyPage(URL_RUGBY_UNION,  'Rugby Union',  'rugby');
    const league = await scrapeRugbyPage(URL_RUGBY_LEAGUE, 'Rugby League', 'rugby');

    // Deduplizieren (selber Event kann auf beiden Seiten erscheinen)
    const seen = new Set();
    const all  = [...union, ...league].filter(e => {
      const key = `${e.event}|${e.iso}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    all.sort((a, b) => a.ts - b.ts);

    console.log(`\n✓ Gesamt: ${all.length} Rugby-Events`);

    const outDir  = path.join(__dirname, 'data');
    const outFile = path.join(outDir, 'rugby.json');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(outFile, JSON.stringify({
      updated: new Date().toISOString(),
      source : 'wheresthematch.com',
      count  : all.length,
      events : all,
    }, null, 2), 'utf8');

    console.log(`✓ Gespeichert: ${outFile}`);
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
})();
