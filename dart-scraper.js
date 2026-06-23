/**
 * KCP Dart-Scraper — Debug v4: Schema.org itemprop check
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

  const res  = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  });
  const html = await res.text();
  console.log(`HTTP: ${res.status}, HTML: ${html.length} Zeichen`);

  const $ = cheerio.load(html);

  // --- DEBUG 1: itemprop-Attribute in Event-Zeilen ---
  console.log('\n--- itemprop in Event-Zeilen ---');
  $('tr[itemscope]').slice(0, 3).each((i, row) => {
    const $row = $(row);
    console.log(`\nEvent-Row ${i}:`);

    // Alle Elemente mit itemprop
    $row.find('[itemprop]').each((_, el) => {
      const prop    = $(el).attr('itemprop');
      const content = $(el).attr('content') || $(el).text().trim().substring(0, 80);
      console.log(`  itemprop="${prop}" → "${content}"`);
    });

    // start-time TD vollständiger Inhalt
    const $st = $row.find('td.start-time, td[class*="time"], td[class*="start"]');
    console.log(`  td.start-time HTML: "${$st.html()?.substring(0, 200)}"`);

    // Alle TDs mit ihrem class und Text
    $row.find('td').each((j, td) => {
      const cls = $(td).attr('class') || '';
      const txt = $(td).text().replace(/\s+/g,' ').trim().substring(0, 60);
      console.log(`  td[${j}] class="${cls}" → "${txt}"`);
    });
  });

  // --- DEBUG 2: JSON-LD im <head> ---
  console.log('\n--- JSON-LD Script-Tags ---');
  $('script[type="application/ld+json"]').each((i, el) => {
    console.log(`JSON-LD [${i}]: ${$(el).html()?.substring(0, 300)}`);
  });

  // --- DEBUG 3: data-Attribute auf Event-Rows ---
  console.log('\n--- data-Attribute auf Event-Rows ---');
  $('tr[itemscope]').slice(0, 3).each((i, row) => {
    const attrs = Object.entries(row.attribs || {}).map(([k,v]) => `${k}="${v}"`).join(', ');
    console.log(`Row ${i}: ${attrs}`);
  });

  return [];
}

(async () => {
  try {
    await scrapeDarts(60);
    const outDir  = path.join(__dirname, 'data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'dart.json'), JSON.stringify({ updated: new Date().toISOString(), source: 'wheresthematch.com', count: 0, events: [] }, null, 2));
    console.log('\n✓ dart.json gespeichert (leer, Debug-Modus)');
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
})();
