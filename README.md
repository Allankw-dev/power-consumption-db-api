# Power Consumption DB API — BCS 4103 Advanced Database Systems Project..

A PostgreSQL-backed CRUD API over the UCI **Individual Household Electric Power Consumption** dataset, built with Node.js/Express, **deployed and live on Oracle Cloud Infrastructure (OCI)**.

## 🟢 Live deployment.

- **API base URL:** `http://92.4.133.3:3000`
- **Health check:** [http://92.4.133.3:3000/health](http://92.4.133.3:3000/health) → should return `{"db":"connected"}`
- **Sample data:** [http://92.4.133.3:3000/api/readings?limit=3](http://92.4.133.3:3000/api/readings?limit=3) → should return 3 real sensor readings

Postman collection is already pointed at this URL — just import and go, no setup required to try it.

## Why this dataset.

Real minute-level power sensor readings from a single household near Paris, France, December 2006 – November 2010 (2,075,259 raw rows — far past the 10,000-record minimum). It's a genuinely different modeling challenge from a typical e-commerce dataset: a dense time series with a natural fact-table + rollup design, which gives the triggers and stored procedures real work to do (per-minute → per-zone breakdown, per-minute → per-day rollups).

## Architecture

```
sql/
  01_schema.sql        Tables: metering_zones, readings, sub_metering_readings, daily_summary
  02_indexes.sql         Indexes for date-range and zone queries
  03_triggers.sql         Validate readings, auto-explode sub-metering, maintain daily rollup
  04_procedures.sql        Stored functions backing /api/reports
scripts/
  load_power_data.js    Streams the real UCI .txt file into Postgres (handles missing '?' values)
src/
  db.js                  Connection pool (max 10, SSL for OCI)
  server.js               Express app entrypoint
  routes/                  readings.js, zones.js, reports.js
postman/
  BCS4103_PowerConsumption.postman_collection.json
docs/
  explain_before_after.txt   EXPLAIN ANALYZE proof of the indexing speedup
```

## Cloud infrastructure (OCI)

| Component | Detail |
|---|---|
| VCN | `power-db-vcn`, CIDR `10.0.0.0/16` |
| Public subnet |  — hosts the compute instance |
| Private subnet | `` — hosts the database, no direct internet access |
| Database system | `power-db-system`, PostgreSQL, private IP `10.0.1.201` |
| Compute instance | `power-api-host`, Oracle Linux, public IP `92.4.133.3` |
| Process manager | pm2 (`power-api` process) — keeps the API running and auto-restarts on crash |

## Schema

- **metering_zones** — reference table: Kitchen, Laundry Room, Water Heater & AC (per the dataset's documentation of sub-metering circuits)
- **readings** — fact table, one row per minute-level sensor reading (`global_active_power`, `voltage`, `global_intensity`, plus the 3 raw sub-metering columns)
- **sub_metering_readings** — normalized per-zone view, populated automatically from `readings` by trigger
- **daily_summary** — materialized daily rollup (reading count, total kWh, avg voltage, max intensity), maintained automatically by trigger

## Triggers

| Trigger | Fires on | Purpose |
|---|---|---|
| `trg_validate_reading` | BEFORE INSERT/UPDATE readings | Reject implausible voltage (<150V or >300V) or negative power |
| `trg_explode_submetering` | AFTER INSERT readings | Auto-split the 3 raw sub-metering columns into `sub_metering_readings` rows |
| `trg_update_daily_summary` | AFTER INSERT readings | Upsert that day's rollup (count, total kWh, running avg voltage, max intensity) |

## Stored procedures (backing `/api/reports`)

- `calculate_total_consumption(start, end)` — total kWh over a date range
- `daily_average(date)` — avg power/voltage and reading count for one day
- `top_consumption_days(limit)` — highest-usage days, read straight from `daily_summary`
- `zone_consumption(start, end)` — kWh breakdown by Kitchen / Laundry / Water Heater & AC

## Running it yourself (local development)

### 1. Database
```bash
psql "$DATABASE_URL" -f sql/01_schema.sql
psql "$DATABASE_URL" -f sql/02_indexes.sql
psql "$DATABASE_URL" -f sql/03_triggers.sql
psql "$DATABASE_URL" -f sql/04_procedures.sql
```

### 2. Data
```bash
npm install
cp .env.example .env   # fill in your DATABASE_URL
node scripts/load_power_data.js path/to/household_power_consumption.txt --limit=60000
```
- `--limit` controls how many valid readings to load (default 60,000 ≈ 6 weeks of minute-level data). The loader streams the file, so it doesn't load the whole 133MB into memory at once.
- `--start=YYYY-MM-DD --end=YYYY-MM-DD` optionally restrict to a specific window.
- Rows with `?` (missing sensor values) are automatically skipped and counted in the summary log.

### 3. API
```bash
npm start
```

### 4. Postman
Import `postman/BCS4103_PowerConsumption.postman_collection.json`. The `baseUrl` variable is already set to the live deployment; change it to `http://localhost:3000` if testing locally instead.

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | ` | DB connectivity check |
| GET/POST | `/ | List / create metering zones |
| GET/PUT/DELETE | `` | Read / update / delete a zone |
| GET/POST |  | List (optionally `?date=`) / create readings |
| GET/PUT/DELETE | ` | Read (with per-zone breakdown) / update / delete |
| GET | ` | Calls `calculate_total_consumption` |
| GET | ` | Calls `daily_average` |
| GET | `| Calls `top_consumption_days` |
| GET | `| Calls `zone_consumption` |

## Verified — against the live OCI deployment, not just locally

- Schema, indexes, triggers, and procedures applied cleanly to the real OCI-managed PostgreSQL instance.
- Loaded **60,000 real readings** from the raw UCI `.txt` (Dec 2006 – Jan 2007) directly into the OCI database, auto-generating **180,000 sub_metering_readings rows** and **43 daily_summary rows** via triggers — confirmed by direct query against the live database.
- Caught and fixed a real data-quality issue during loading: the raw file uses unpadded dates (`1/1/2007`, not `01/01/2007`), which broke naive ISO timestamp parsing — the loader now zero-pads day/month.
- Trigger validation confirmed working on the live database: an out-of-range voltage (999V) insert was correctly rejected.
- All 4 stored procedures return correct real-world figures, e.g. total consumption Dec 16 2006 – Jan 31 2007 = **1,667.9 kWh**; the household's water heater/AC circuit is by far the largest single load (430,935 Wh vs. 113,122 Wh laundry, 77,047 Wh kitchen) over the same window.
- **Indexing impact measured directly**: a date-range aggregate query dropped from **653ms (sequential scan)** to **33ms (index scan)** — a ~20x speedup — after `idx_readings_date` was applied. Full EXPLAIN ANALYZE output is in `docs/explain_before_after.txt`.
- The **deployed API** was tested end-to-end via Postman and a plain browser, hitting the public IP directly — not localhost, not a test environment.

## Team



## Security notes

- Database sits in a private OCI subnet with no public IP; reachable only from the API's compute instance within the same VCN.
- Connections use TLS; OCI managed PostgreSQL enforces encrypted connections by default.
- All queries are parameterized (no string-concatenated SQL) via the `pg` library.
- Credentials are read from `.env` (git-ignored), never hard-coded.
- **Known limitation:** the API currently connects using the database admin role. A production deployment should use a dedicated least-privilege role instead.
