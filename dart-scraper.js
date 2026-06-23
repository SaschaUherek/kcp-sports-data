/**
 * KCP Dart-Scraper — Debug-Version
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

function parseWtmDate(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/(\d+)(st|nd|rd|th)/g, '$1');
  const months  = {
    January:0, February:1, March:2, April:3, May:4, June:5,
    July:6, August:7, September:8, October:9, November:10, December:11,
  };
  const m = cleaned.match(/(?:\w{3}\s+)?(\d{1,2})\s+(\w+)\s+(\d{4})(?:\s+(\d{2}:\d{2}))?/);
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

  // --- DEBUG: Struktur analysieren ---
  const $ = cheerio.load(html);

  const tableCount = $('table').length;
  const trCount    = $('table tr').length;
  const linkCount  = $('table a').length;
  console.log(`Tabellen: ${tableCount}, TR: ${trCount}, Links in Tabellen: ${linkCount}`);

  // Zeige erste 3 Links aus der Tabelle
  $('table a').slice(0, 5).each((i, el) => {
    console.log(`  Link ${i}: ${$(el).attr('href')} → "${$(el).text().trim().substring(0, 60)}"`);
  });

  // Suche nach Event-Links (Muster: /event/ in der URL)
  const eventLinks = $('a[href*="/event/"]');
  console.log(`Event-Links (/event/): ${eventLinks.length}`);
  eventLinks.slice(0, 3).each((i, el) => {
    console.log(`  Event ${i}: ${$(el).attr('href')}`);
  });

  // Suche nach Datumstext
  const bodyText  = $('body').text();
  const dateHits  = bodyText.match(/\w{3} \d{1,2}(?:st|nd|rd|th) \w+ \d{4}/g);
  console.log(`Datums-Pattern im Body: ${dateHits ? dateHits.slice(0,3).join(' | ') : 'KEINE'}`);

  // Zeige ersten 1000 Zeichen der Tabelle
  const firstTable = $('table').first().html();
  if (firstTable) {
    console.log('--- Erste 1000 Zeichen der ersten Tabelle ---');
    console.log(firstTable.substring(0, 1000));
  } else {
    console.log('KEINE Tabelle gefunden!');
    // Zeige was überhaupt im Body steht
    console.log('--- Body-Ausschnitt (erste 1000 Zeichen) ---');
    console.log($('body').text().trim().substring(0, 1000));
  }

  // --- Eigentliches Scraping (verschiedene Selektoren probieren) ---
  const events = [];
  const now    = Math.floor(Date.now() / 1000);

  // Versuch 1: Event-Links direkt finden
  $('a[href*="/event/"]').each((_, el) => {
    const $el   = $(el);
    const $row  = $el.closest('tr');
    if (!$row.length) return;

    const eventName = $el.text().trim() || $el.find('strong').text().trim();
    if (!eventName || eventName.length < 3) return;

    // Datum aus derselben Zeile
    const rowText = $row.text();
    const dateMatch = rowText.match(/(\w{3} \d{1,2}(?:st|nd|rd|th) \w+ \d{4}(?:\s+\d{2}:\d{2})?)/);
    if (!dateMatch) return;

    const dt = parseWtmDate(dateMatch[1]);
    if (!dt) return;

    const ts = Math.floor(dt.getTime() / 1000);
    if (ts < now) return; // vergangene Events überspringen

    const datum   = dt.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'short' });
    const uhrzeit = dt.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });

    events.push({
      sport   : 'dart',
      liga    : 'PDC Darts',
      liga_kz : 'dart',
      event   : eventName,
      location: null,
      datum,
      uhrzeit,
      iso     : dt.toISOString(),
      ts,
      link    : `https://www.wheresthematch.com${$el.attr('href')}`,
    });
  });

  console.log(`Versuch 1 (Event-Links): ${events.length} Events`);

  // Deduplizieren
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
    events.slice(0, 5).forEach(e =>
      console.log(`  ${e.datum} ${e.uhrzeit} – ${e.event}`)
    );

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
