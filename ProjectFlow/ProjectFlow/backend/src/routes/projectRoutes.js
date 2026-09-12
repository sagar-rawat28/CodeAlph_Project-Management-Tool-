const express = require('express');
const { body } = require('express-validator');
const {
  createProject,
  getMyProjects,
  getProject,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  updateMemberRole,
} = require('../controllers/projectController');
const { authenticate } = require('../middleware/auth');
const { requireProjectMember, requireRole } = require('../middleware/projectAuth');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  [body('name').trim().notEmpty().withMessage('Project name is required')],
  createProject
);

router.get('/', getMyProjects);

router.get('/:projectId', requireProjectMember, getProject);

router.put(
  '/:projectId',
  requireProjectMember,
  requireRole('OWNER', 'ADMIN'),
  updateProject
);

router.delete(
  '/:projectId',
  requireProjectMember,
  requireRole('OWNER'),
  deleteProject
);

router.post(
  '/:projectId/members',
  requireProjectMember,
  requireRole('OWNER', 'ADMIN'),
  addMember
);

router.delete(
  '/:projectId/members/:userId',
  requireProjectMember,
  requireRole('OWNER', 'ADMIN'),
  removeMember
);

router.patch(
  '/:projectId/members/:userId',
  requireProjectMember,
  requireRole('OWNER'),
  updateMemberRole
);

module.exports = router;
