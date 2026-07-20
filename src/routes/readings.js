const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/readings?limit=25&offset=0&date=2007-01-15
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const { date } = req.query;
  try {
    let result;
    if (date) {
      result = await pool.query(
        'SELECT * FROM readings WHERE reading_date = $1 ORDER BY reading_ts LIMIT $2 OFFSET $3',
        [date, limit, offset]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM readings ORDER BY reading_ts LIMIT $1 OFFSET $2',
        [limit, offset]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/readings/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM readings WHERE reading_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reading not found' });

    const zonesRes = await pool.query(
      `SELECT mz.zone_name, smr.watt_hours FROM sub_metering_readings smr
       JOIN metering_zones mz ON mz.zone_id = smr.zone_id
       WHERE smr.reading_id = $1`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], zones: zonesRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/readings
router.post('/', async (req, res) => {
  const {
    reading_date, reading_time, global_active_power, global_reactive_power,
    voltage, global_intensity, sub_metering_1, sub_metering_2, sub_metering_3
  } = req.body;

  if (!reading_date || !reading_time) {
    return res.status(400).json({ error: 'reading_date and reading_time are required' });
  }

  const reading_ts = `${reading_date}T${reading_time}`;

  try {
    const result = await pool.query(
      `INSERT INTO readings
        (reading_date, reading_time, reading_ts, global_active_power, global_reactive_power,
         voltage, global_intensity, sub_metering_1, sub_metering_2, sub_metering_3)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [reading_date, reading_time, reading_ts, global_active_power, global_reactive_power,
       voltage, global_intensity, sub_metering_1 || 0, sub_metering_2 || 0, sub_metering_3 || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A reading already exists at that timestamp' });
    res.status(400).json({ error: err.message }); // e.g. trigger validation errors surface here
  }
});

// PUT /api/readings/:id
router.put('/:id', async (req, res) => {
  const { global_active_power, voltage, global_intensity } = req.body;
  try {
    const result = await pool.query(
      `UPDATE readings SET
         global_active_power = COALESCE($1, global_active_power),
         voltage = COALESCE($2, voltage),
         global_intensity = COALESCE($3, global_intensity)
       WHERE reading_id = $4 RETURNING *`,
      [global_active_power, voltage, global_intensity, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reading not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/readings/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM readings WHERE reading_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reading not found' });
    res.json({ deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
