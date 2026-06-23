/**
 * KCP Dart-Scraper — finale Version
 * Quelle: wheresthematch.com/live-darts-on-tv
 *
 * Datum + Uhrzeit kommen aus itemprop="startDate" (ISO-Format, z.B. "2026-07-06T13:00:00Z")
 * Event-Name aus itemprop="name"
 * Location aus td.fixture-details
 */

import fetch  from 'node-fetch';
import * as cheerio from 'cheerio';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function toUrlDate(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

async function scrapeDarts(days = 60) {
  const today = new Date();
  const end   = new Date(today);
  end.setDate(today.getDate() + days);

  const url = `https://www.wheresthematch.com/live-darts-on-tv/?showdatestart=${toUrlDate(today)}&showdateend=${toUrlDate(end)}`;
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

    // Event-Name aus itemprop="name"
    const eventName = $row.find('[itemprop="name"]').text().trim();
    if (!eventName) return;

    // Location: em-Text in fixture-details, bereinigt
    const emText = $row.find('td.fixture-details em').text().trim();
    // Format: "Darts [icon-alt] Beschreibung - Venue, City"
    // Alles nach dem letzten " - " ist die Venue
    const dashIdx = emText.lastIndexOf(' - ');
    const location = dashIdx > -1
      ? emText.substring(dashIdx + 3).trim()
      : emText.replace(/^Darts\s*/i, '').trim() || null;

    // Datum + Uhrzeit auf Deutsch formatieren
    const datum   = dt.toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/Berlin'
    });
    const uhrzeit = dt.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
    });

    console.log(`  ✓ ${datum} ${uhrzeit} – ${eventName}${location ? ' @ '+location : ''}`);

    events.push({
      sport   : 'dart',
      liga    : 'PDC Darts',
      liga_kz : 'dart',
      event   : eventName,
      location: location || null,
      datum,
      uhrzeit,
      iso     : dt.toISOString(),
      ts,
    });
  });

  // Deduplizieren + sortieren
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
