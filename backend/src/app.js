/*
  KinoCampus Backend (placeholder) - V6.0.0

  Objetivo:
  - Servir o frontend estático
  - Expor uma API inicial em /api/v1

  OBS: Este arquivo não é executado automaticamente no protótipo.
*/

const path = require('path');
const express = require('express');

const postsRouter = require('./routes/posts.routes');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Static: o build inicial pode ser apenas servir a pasta frontend
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
app.use('/', express.static(FRONTEND_DIR));

// API v1
app.use('/api/v1/posts', postsRouter);

// Health
app.get('/api/v1/health', (req, res) => res.json({ ok: true }));

module.exports = app;
