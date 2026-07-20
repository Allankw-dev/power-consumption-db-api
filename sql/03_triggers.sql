-- ============================================================
-- Triggers
-- ============================================================

-- 1. Reject physically implausible readings (business rule enforcement).
--    Household mains voltage in this dataset's region is nominally ~230V;
--    anything wildly outside a sane band or negative power is bad data.
CREATE OR REPLACE FUNCTION fn_validate_reading()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.voltage IS NOT NULL AND (NEW.voltage < 150 OR NEW.voltage > 300) THEN
        RAISE EXCEPTION 'readings.voltage out of plausible range: % (reading_ts %)', NEW.voltage, NEW.reading_ts;
    END IF;
    IF NEW.global_active_power IS NOT NULL AND NEW.global_active_power < 0 THEN
        RAISE EXCEPTION 'readings.global_active_power cannot be negative (reading_ts %)', NEW.reading_ts;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_reading
BEFORE INSERT OR UPDATE ON readings
FOR EACH ROW
EXECUTE FUNCTION fn_validate_reading();


-- 2. Auto-normalize sub-metering columns into sub_metering_readings.
--    This is the "automate routine tasks" trigger — callers only ever
--    insert into the wide `readings` row; the per-zone breakdown is
--    generated for them.
CREATE OR REPLACE FUNCTION fn_explode_submetering()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sub_metering_1 IS NOT NULL THEN
        INSERT INTO sub_metering_readings (reading_id, zone_id, watt_hours)
        VALUES (NEW.reading_id, 1, NEW.sub_metering_1);
    END IF;
    IF NEW.sub_metering_2 IS NOT NULL THEN
        INSERT INTO sub_metering_readings (reading_id, zone_id, watt_hours)
        VALUES (NEW.reading_id, 2, NEW.sub_metering_2);
    END IF;
    IF NEW.sub_metering_3 IS NOT NULL THEN
        INSERT INTO sub_metering_readings (reading_id, zone_id, watt_hours)
        VALUES (NEW.reading_id, 3, NEW.sub_metering_3);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_explode_submetering
AFTER INSERT ON readings
FOR EACH ROW
EXECUTE FUNCTION fn_explode_submetering();


-- 3. Keep daily_summary in sync automatically (upsert on every reading).
CREATE OR REPLACE FUNCTION fn_update_daily_summary()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO daily_summary (summary_date, reading_count, total_active_power_kwh, avg_voltage, max_global_intensity)
    VALUES (
        NEW.reading_date,
        1,
        COALESCE(NEW.global_active_power, 0) / 60.0,  -- 1-minute reading -> kWh
        NEW.voltage,
        NEW.global_intensity
    )
    ON CONFLICT (summary_date) DO UPDATE SET
        reading_count = daily_summary.reading_count + 1,
        total_active_power_kwh = daily_summary.total_active_power_kwh + (COALESCE(NEW.global_active_power, 0) / 60.0),
        avg_voltage = (daily_summary.avg_voltage * daily_summary.reading_count + COALESCE(NEW.voltage, daily_summary.avg_voltage))
                      / (daily_summary.reading_count + 1),
        max_global_intensity = GREATEST(daily_summary.max_global_intensity, COALESCE(NEW.global_intensity, 0));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_daily_summary
AFTER INSERT ON readings
FOR EACH ROW
EXECUTE FUNCTION fn_update_daily_summary();
