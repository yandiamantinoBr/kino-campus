const express = require('express');
const router = express.Router();

const postsController = require('../controllers/posts.controller');

router.get('/', postsController.list);
router.get('/:id', postsController.getById);
router.post('/', postsController.create);

module.exports = router;
