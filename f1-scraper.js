/**
 * KCP Formel-1-Scraper
 * Quelle: wheresthematch.com/live-formula-one-on-tv
 *
 * Gleiche Struktur wie dart-scraper.js — itemprop="startDate" liefert ISO-Datum+Zeit.
 * Zeigt nur Qualifying + Rennen (keine Practice-Sessions).
 */

import fetch  from 'node-fetch';
import * as cheerio from 'cheerio';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Nur diese Sessions anzeigen (Practice für Pub-Abend weniger relevant)
const SHOW_SESSIONS = ['race', 'qualifying', 'sprint', 'grand prix', 'finale'];

function toUrlDate(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// Session-Typ aus dem em-Text extrahieren ("Formula 1  Race - Circuit...")
function getSession(emText) {
  const match = emText.match(/Formula\s*1\s+([\w\s]+?)\s*-/i);
  return match ? match[1].trim() : '';
}

// Session-Typ auf Deutsch
function sessionDe(session) {
  const map = {
    'race'               : 'Rennen',
    'qualifying'         : 'Qualifying',
    'sprint qualifying'  : 'Sprint Qualifying',
    'sprint'             : 'Sprint',
    'practice 1'         : 'Training 1',
    'practice 2'         : 'Training 2',
    'practice 3'         : 'Training 3',
  };
  return map[session.toLowerCase()] || session;
}

async function scrapeF1(days = 90) {
  const today = new Date();
  const end   = new Date(today);
  end.setDate(today.getDate() + days);

  const url = `https://www.wheresthematch.com/live-formula-one-on-tv/?showdatestart=${toUrlDate(today)}&showdateend=${toUrlDate(end)}`;
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

    // Datum + Zeit aus itemprop="startDate"
    const isoRaw = $row.find('[itemprop="startDate"]').attr('content');
    if (!isoRaw) return;

    const dt = new Date(isoRaw);
    if (isNaN(dt.getTime())) return;

    const ts = Math.floor(dt.getTime() / 1000);
    if (ts < now) return;

    // Event-Name (z.B. "Canadian Grand Prix")
    const eventName = $row.find('[itemprop="name"]').text().trim();
    if (!eventName) return;

    // Session-Typ aus em-Text
    const emText = $row.find('td.fixture-details em').text().trim();
    const session = getSession(emText);

    // Nur relevante Sessions anzeigen
    const sessionLow = session.toLowerCase();
    const relevant   = SHOW_SESSIONS.some(s => sessionLow.includes(s));
    if (!relevant) return;

    // Location: alles nach dem letzten " - "
    const dashIdx = emText.lastIndexOf(' - ');
    const location = dashIdx > -1 ? emText.substring(dashIdx + 3).trim() : null;

    // Datum + Uhrzeit auf Deutsch (Berliner Zeit)
    const datum   = dt.toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/Berlin'
    });
    const uhrzeit = dt.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
    });

    // Event-Label: "Canadian Grand Prix · Rennen"
    const label = session ? `${eventName} · ${sessionDe(session)}` : eventName;

    console.log(`  ✓ ${datum} ${uhrzeit} – ${label}`);

    events.push({
      sport   : 'f1',
      liga    : 'Formel 1',
      liga_kz : 'f1',
      event   : label,
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
    const events = await scrapeF1(90);
    console.log(`\n✓ Gesamt: ${events.length} F1-Events`);

    const outDir  = path.join(__dirname, 'data');
    const outFile = path.join(outDir, 'f1.json');
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
