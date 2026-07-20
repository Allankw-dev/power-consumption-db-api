const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/zones
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM metering_zones ORDER BY zone_id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zones/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM metering_zones WHERE zone_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/zones
router.post('/', async (req, res) => {
  const { zone_name, description } = req.body;
  if (!zone_name) return res.status(400).json({ error: 'zone_name is required' });
  try {
    const result = await pool.query(
      'INSERT INTO metering_zones (zone_name, description) VALUES ($1, $2) RETURNING *',
      [zone_name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'zone_name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/zones/:id
router.put('/:id', async (req, res) => {
  const { zone_name, description } = req.body;
  try {
    const result = await pool.query(
      `UPDATE metering_zones SET
         zone_name = COALESCE($1, zone_name),
         description = COALESCE($2, description)
       WHERE zone_id = $3 RETURNING *`,
      [zone_name, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/zones/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM metering_zones WHERE zone_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    res.json({ deleted: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'Cannot delete: zone referenced by existing sub_metering_readings' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
