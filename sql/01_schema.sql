

DROP TABLE IF EXISTS sub_metering_readings CASCADE;
DROP TABLE IF EXISTS daily_summary CASCADE;
DROP TABLE IF EXISTS readings CASCADE;
DROP TABLE IF EXISTS metering_zones CASCADE;

.
CREATE TABLE metering_zones (
    zone_id    SERIAL PRIMARY KEY,
    zone_name  VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

INSERT INTO metering_zones (zone_id, zone_name, description) VALUES
    (1, 'Kitchen', 'Sub-metering 1: dishwasher, oven, microwave'),
    (2, 'Laundry Room', 'Sub-metering 2: washing machine, tumble dryer, refrigerator, light'),
    (3, 'Water Heater & AC', 'Sub-metering 3: electric water heater and air conditioner');

CREATE TABLE readings (
    reading_id             BIGSERIAL PRIMARY KEY,
    reading_date            DATE NOT NULL,
    reading_time             TIME NOT NULL,
    reading_ts               TIMESTAMP NOT NULL,
    global_active_power       NUMERIC(8,3),   -- kilowatts
    global_reactive_power     NUMERIC(8,3),   -- kilowatts
    voltage                    NUMERIC(6,2),   -- volts
    global_intensity           NUMERIC(6,2),   -- amps
    sub_metering_1              NUMERIC(8,3),  -- watt-hours (kitchen)
    sub_metering_2              NUMERIC(8,3),  -- watt-hours (laundry room)
    sub_metering_3              NUMERIC(8,3),  -- watt-hours (water heater & AC)
    UNIQUE (reading_ts)
);

CREATE TABLE sub_metering_readings (
    id           BIGSERIAL PRIMARY KEY,
    reading_id   BIGINT NOT NULL REFERENCES readings(reading_id) ON DELETE CASCADE,
    zone_id      INTEGER NOT NULL REFERENCES metering_zones(zone_id),
    watt_hours   NUMERIC(8,3) NOT NULL
);



CREATE TABLE daily_summary (
    summary_date          DATE PRIMARY KEY,
    reading_count           INTEGER NOT NULL DEFAULT 0,
    total_active_power_kwh   NUMERIC(12,3) NOT NULL DEFAULT 0,
    avg_voltage               NUMERIC(6,2),
    max_global_intensity       NUMERIC(6,2)
);

COMMENT ON TABLE readings IS 'Fact table: one row per minute-level power reading. Real dataset has 2M+ rows; project loads a representative subset (10,000+).';
