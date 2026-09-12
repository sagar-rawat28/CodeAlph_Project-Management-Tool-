const express = require('express');
const { createColumn, updateColumn, deleteColumn } = require('../controllers/columnController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', createColumn);
router.put('/:columnId', updateColumn);
router.delete('/:columnId', deleteColumn);

module.exports = router;
