const express = require('express');
const { body } = require('express-validator');
const {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getTask,
} = require('../controllers/taskController');
const { createComment, deleteComment } = require('../controllers/commentController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('columnId').notEmpty().withMessage('Column ID is required'),
  ],
  createTask
);

router.get('/:taskId', getTask);
router.put('/:taskId', updateTask);
router.patch('/:taskId/move', moveTask);
router.delete('/:taskId', deleteTask);

router.post('/:taskId/comments', createComment);
router.delete('/comments/:commentId', deleteComment);

module.exports = router;
