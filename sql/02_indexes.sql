-- ============================================================
-- Indexing strategy
-- ============================================================

-- Date-range queries are the dominant access pattern for this dataset
CREATE INDEX idx_readings_date ON readings(reading_date);
CREATE INDEX idx_readings_ts ON readings(reading_ts);

-- Speeds up "all sub-metering rows for a reading" (used by the trigger's
-- reverse lookups and by zone reports)
CREATE INDEX idx_submetering_reading_id ON sub_metering_readings(reading_id);
CREATE INDEX idx_submetering_zone_id ON sub_metering_readings(zone_id);

-- Speeds up "find unusually high load" queries
CREATE INDEX idx_readings_global_active_power ON readings(global_active_power);

-- Partial index: voltage anomalies are rare but frequently queried
CREATE INDEX idx_readings_voltage_out_of_range ON readings(reading_ts)
    WHERE voltage < 220 OR voltage > 250;
