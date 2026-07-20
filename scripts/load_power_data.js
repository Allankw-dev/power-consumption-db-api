/**
 * Loads the REAL UCI "Individual Household Electric Power Consumption"
 * dataset into PostgreSQL. The raw file is semicolon-delimited with
 * missing values marked '?', and is large (~2 million rows) — this
 * script streams it and loads a bounded slice so the demo DB stays
 * fast, while still comfortably clearing the 10,000-record minimum.
 *
 * Usage:
 *   node scripts/load_power_data.js <path-to-txt> [--limit=60000] [--start=2007-01-01] [--end=2007-02-15]
 *
 * With no --start/--end, it takes the first N valid (non-'?') rows,
 * where N = --limit (default 60000, ≈ 6 weeks of minute-level data).
 */

require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { Pool } = require('pg');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/load_power_data.js <path-to-txt> [--limit=60000] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD]');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(3)
    .filter(a => a.startsWith('--'))
    .map(a => a.replace('--', '').split('='))
);
const LIMIT = parseInt(args.limit, 10) || 60000;
const startFilter = args.start ? new Date(args.start) : null;
const endFilter = args.end ? new Date(args.end) : null;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

function parseDDMMYYYY(d) {
  const [dd, mm, yyyy] = d.split('/');
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function main() {
  const client = await pool.connect();
  const rl = readline.createInterface({
    input: fs.createReadStream(path.resolve(filePath)),
    crlfDelay: Infinity
  });

  let isFirstLine = true;
  let inserted = 0;
  let skippedMissing = 0;
  let scanned = 0;

  const BATCH = [];
  const BATCH_SIZE = 1000;

  async function flushBatch() {
    if (BATCH.length === 0) return;
    const text = `
      INSERT INTO readings
        (reading_date, reading_time, reading_ts, global_active_power, global_reactive_power,
         voltage, global_intensity, sub_metering_1, sub_metering_2, sub_metering_3)
      VALUES ${BATCH.map((_, idx) => {
        const base = idx * 10;
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
      }).join(',')}
      ON CONFLICT (reading_ts) DO NOTHING
    `;
    const flatParams = [];
    for (const r of BATCH) {
      flatParams.push(r.date, r.time, r.ts, r.gap, r.grp, r.voltage, r.gi, r.sm1, r.sm2, r.sm3);
    }
    await client.query(text, flatParams);
    inserted += BATCH.length;
    BATCH.length = 0;
  }

  for await (const line of rl) {
    if (isFirstLine) { isFirstLine = false; continue; } // header
    if (inserted >= LIMIT) break;

    const cols = line.trim().split(';');
    if (cols.length < 9) continue;
    scanned++;

    const [dateRaw, time, gap, grp, voltage, gi, sm1, sm2, sm3] = cols;
    if ([gap, grp, voltage, gi, sm1, sm2, sm3].includes('?')) { skippedMissing++; continue; }

    const isoDate = parseDDMMYYYY(dateRaw);
    const ts = new Date(`${isoDate}T${time}`);
    if (Number.isNaN(ts.getTime())) {
      skippedMissing++;
      continue; // malformed date/time on this line — skip rather than crash the batch
    }

    if (startFilter && ts < startFilter) continue;
    if (endFilter && ts > endFilter) continue;

    BATCH.push({
      date: isoDate, time, ts,
      gap: parseFloat(gap), grp: parseFloat(grp), voltage: parseFloat(voltage),
      gi: parseFloat(gi), sm1: parseFloat(sm1), sm2: parseFloat(sm2), sm3: parseFloat(sm3)
    });

    if (BATCH.length >= BATCH_SIZE) {
      await flushBatch();
      console.log(`  ${inserted} rows inserted so far (scanned ${scanned}, skipped ${skippedMissing} for missing values)...`);
    }
  }
  await flushBatch();

  console.log(`Done. Inserted ${inserted} readings (scanned ${scanned}, skipped ${skippedMissing} missing-value rows).`);
  client.release();
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
