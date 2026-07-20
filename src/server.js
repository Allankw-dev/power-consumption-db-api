const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db');
const readingsRouter = require('./routes/readings');
const zonesRouter = require('./routes/zones');
const reportsRouter = require('./routes/reports');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok', service: 'power-consumption-api' }));
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ db: 'connected' });
  } catch (err) {
    res.status(500).json({ db: 'error', message: err.message });
  }
});

app.use('/api/readings', readingsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/reports', reportsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`power-consumption-api listening on port ${PORT}`));

module.exports = app;
