const postsService = require('../services/posts.service');

exports.list = async (req, res) => {
  const { module, q, category, page = '1', limit = '20' } = req.query;
  const result = await postsService.list({ module, q, category, page: Number(page), limit: Number(limit) });
  res.json(result);
};

exports.getById = async (req, res) => {
  const id = String(req.params.id);
  const post = await postsService.getById(id);
  if (!post) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(post);
};

exports.create = async (req, res) => {
  const created = await postsService.create(req.body || {});
  res.status(201).json(created);
};
