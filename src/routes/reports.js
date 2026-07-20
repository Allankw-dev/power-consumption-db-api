const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/reports/total-consumption?start=2007-01-01&end=2007-01-31
router.get('/total-consumption', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
  try {
    const result = await pool.query('SELECT calculate_total_consumption($1, $2) AS total_kwh', [start, end]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/daily-average?date=2007-01-15
router.get('/daily-average', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
  try {
    const result = await pool.query('SELECT * FROM daily_average($1)', [date]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/top-consumption-days?limit=10
router.get('/top-consumption-days', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  try {
    const result = await pool.query('SELECT * FROM top_consumption_days($1)', [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/zone-consumption?start=2007-01-01&end=2007-01-31
router.get('/zone-consumption', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
  try {
    const result = await pool.query('SELECT * FROM zone_consumption($1, $2)', [start, end]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
