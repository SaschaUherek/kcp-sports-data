/**
 * KCP Dart-Scraper — Debug v3
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

function parseWtmDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/ /g, ' ').trim().replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const months = { January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11 };
  const m = cleaned.match(/(?:\w+\s+)?(\d{1,2})\s+(\w+)\s+(\d{4})(?:[\s,]+(\d{1,2}:\d{2}))?/);
  if (!m) return null;
  const monthIdx = months[m[2]];
  if (monthIdx === undefined) return null;
  const [hh, mm] = (m[4] || '00:00').split(':').map(Number);
  return new Date(Number(m[3]), monthIdx, Number(m[1]), hh, mm, 0);
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

  const html = await res.text();
  console.log(`HTTP: ${res.status}, HTML: ${html.length} Zeichen`);

  const $ = cheerio.load(html);

  // --- DEBUG: Alle TR-Zeilen untersuchen ---
  console.log('\n--- Alle TR-Zeilen ---');
  $('table tr').each((i, row) => {
    const $row    = $(row);
    const hasItem = $row.is('[itemscope]');
    const thText  = $row.find('th').map((_, th) => $(th).text().replace(/\s+/g,' ').trim()).get().join(' | ');
    const tdText  = $row.text().replace(/\s+/g,' ').trim().substring(0, 100);
    const classes = $row.attr('class') || '';

    if (thText || hasItem || tdText.match(/\d{4}/)) {
      console.log(`TR[${i}] itemscope=${hasItem} class="${classes}"`);
      if (thText) console.log(`  TH: "${thText}"`);
      if (tdText) console.log(`  TD: "${tdText}"`);
    }
  });

  return [];
}

(async () => {
  try {
    const events = await scrapeDarts(60);
    console.log(`\n✓ Gesamt: ${events.length} Events`);

    const outDir  = path.join(__dirname, 'data');
    const outFile = path.join(outDir, 'dart.json');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify({ updated: new Date().toISOString(), source: 'wheresthematch.com', count: 0, events: [] }, null, 2));
    console.log(`✓ Gespeichert: ${outFile}`);
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
})();
