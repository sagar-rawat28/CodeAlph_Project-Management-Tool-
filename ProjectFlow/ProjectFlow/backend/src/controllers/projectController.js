const { validationResult } = require('express-validator');
const prisma = require('../utils/prisma');

const createProject = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;

    const project = await prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          ownerId: req.user.id,
        },
      });

      await tx.projectMember.create({
        data: {
          projectId: proj.id,
          userId: req.user.id,
          role: 'OWNER',
        },
      });

      const board = await tx.board.create({
        data: {
          name: 'Main Board',
          projectId: proj.id,
        },
      });

      const defaultColumns = [
        { name: 'Backlog', order: 0 },
        { name: 'To Do', order: 1 },
        { name: 'In Progress', order: 2 },
        { name: 'Review', order: 3 },
        { name: 'Completed', order: 4 },
      ];

      await tx.column.createMany({
        data: defaultColumns.map((c) => ({
          ...c,
          boardId: board.id,
        })),
      });

      return proj;
    });

    await prisma.activityLog.create({
      data: {
        action: 'PROJECT_CREATED',
        details: `Created project "${project.name}"`,
        userId: req.user.id,
        projectId: project.id,
      },
    });

    const full = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        owner: { select: { id: true, name: true, email: true, avatar: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        },
        boards: {
          include: {
            columns: {
              orderBy: { order: 'asc' },
              include: {
                tasks: {
                  orderBy: { order: 'asc' },
                  include: {
                    assignee: { select: { id: true, name: true, email: true, avatar: true } },
                    creator: { select: { id: true, name: true, email: true, avatar: true } },
                    _count: { select: { comments: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    res.status(201).json({ message: 'Project created', project: full });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

const getMyProjects = async (req, res) => {
  try {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.user.id },
      include: {
        project: {
          include: {
            owner: { select: { id: true, name: true, email: true, avatar: true } },
            members: {
              include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
            },
            _count: { select: { boards: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const projects = memberships.map((m) => ({
      ...m.project,
      myRole: m.role,
    }));

    res.json({ projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

const getProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.projectId },
      include: {
        owner: { select: { id: true, name: true, email: true, avatar: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        },
        boards: {
          include: {
            columns: {
              orderBy: { order: 'asc' },
              include: {
                tasks: {
                  orderBy: { order: 'asc' },
                  include: {
                    assignee: { select: { id: true, name: true, email: true, avatar: true } },
                    creator: { select: { id: true, name: true, email: true, avatar: true } },
                    _count: { select: { comments: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      project: {
        ...project,
        myRole: req.membership.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};

const updateProject = async (req, res) => {
  try {
    const { name, description } = req.body;
    const data = {};
    if (name) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;

    const project = await prisma.project.update({
      where: { id: req.projectId },
      data,
      include: {
        owner: { select: { id: true, name: true, email: true, avatar: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'PROJECT_UPDATED',
        details: `Updated project details`,
        userId: req.user.id,
        projectId: req.projectId,
      },
    });

    res.json({ message: 'Project updated', project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

const deleteProject = async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.projectId } });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};

const addMember = async (req, res) => {
  try {
    const { email, role = 'MEMBER' } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found. They must register first.' });
    }

    const existing = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: req.projectId, userId: user.id },
      },
    });
    if (existing) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId: req.projectId,
        userId: user.id,
        role: ['ADMIN', 'MEMBER'].includes(role) ? role : 'MEMBER',
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    await prisma.notification.create({
      data: {
        type: 'MEMBER_ADDED',
        message: `You were added to a project`,
        userId: user.id,
        projectId: req.projectId,
        link: `/projects/${req.projectId}`,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'MEMBER_ADDED',
        details: `Added ${user.name} as ${member.role}`,
        userId: req.user.id,
        projectId: req.projectId,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${req.projectId}`).emit('member:added', member);
      io.to(`user:${user.id}`).emit('notification:new', {
        type: 'MEMBER_ADDED',
        message: `You were added to a project`,
      });
    }

    res.status(201).json({ message: 'Member added', member });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

const removeMember = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: req.projectId, userId },
      },
    });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    if (member.role === 'OWNER') {
      return res.status(400).json({ error: 'Cannot remove the owner' });
    }

    await prisma.projectMember.delete({
      where: {
        projectId_userId: { projectId: req.projectId, userId },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'MEMBER_REMOVED',
        details: `Removed a member`,
        userId: req.user.id,
        projectId: req.projectId,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${req.projectId}`).emit('member:removed', { userId });
    }

    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

const updateMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!['ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const member = await prisma.projectMember.update({
      where: {
        projectId_userId: { projectId: req.projectId, userId },
      },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    res.json({ message: 'Role updated', member });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update role' });
  }
};

module.exports = {
  createProject,
  getMyProjects,
  getProject,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  updateMemberRole,
};
