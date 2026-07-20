-- ============================================================
-- Stored procedures / functions
-- ============================================================

-- 1. Total energy consumption (kWh) over a date range — the direct
--    analogue of the brief's "calculate total sales" example.
CREATE OR REPLACE FUNCTION calculate_total_consumption(p_start DATE, p_end DATE)
RETURNS NUMERIC AS $$
DECLARE
    v_total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(global_active_power), 0) / 60.0
    INTO v_total
    FROM readings
    WHERE reading_date BETWEEN p_start AND p_end;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql;


-- 2. Daily average stats for a single day
CREATE OR REPLACE FUNCTION daily_average(p_date DATE)
RETURNS TABLE (
    avg_active_power NUMERIC,
    avg_voltage NUMERIC,
    reading_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT ROUND(AVG(global_active_power), 3), ROUND(AVG(voltage), 2), COUNT(*)
    FROM readings
    WHERE reading_date = p_date;
END;
$$ LANGUAGE plpgsql;


-- 3. Highest-consumption days (uses the daily_summary rollup table,
--    so this is effectively O(days) rather than O(minutes))
CREATE OR REPLACE FUNCTION top_consumption_days(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    summary_date DATE,
    total_active_power_kwh NUMERIC,
    reading_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT ds.summary_date, ds.total_active_power_kwh, ds.reading_count
    FROM daily_summary ds
    ORDER BY ds.total_active_power_kwh DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- 4. Consumption broken down by metering zone for a date range
CREATE OR REPLACE FUNCTION zone_consumption(p_start DATE, p_end DATE)
RETURNS TABLE (
    zone_name VARCHAR,
    total_watt_hours NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT mz.zone_name, COALESCE(SUM(smr.watt_hours), 0)
    FROM sub_metering_readings smr
    JOIN metering_zones mz ON mz.zone_id = smr.zone_id
    JOIN readings r ON r.reading_id = smr.reading_id
    WHERE r.reading_date BETWEEN p_start AND p_end
    GROUP BY mz.zone_name
    ORDER BY total_watt_hours DESC;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- Example EXPLAIN ANALYZE usage for the "before/after indexing"
-- comparison in the report:
--
--   EXPLAIN ANALYZE SELECT calculate_total_consumption('2007-01-01','2007-01-31');
--   EXPLAIN ANALYZE SELECT * FROM zone_consumption('2007-01-01','2007-01-31');
-- ------------------------------------------------------------
