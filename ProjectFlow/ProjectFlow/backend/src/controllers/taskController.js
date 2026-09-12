const { validationResult } = require('express-validator');
const prisma = require('../utils/prisma');

const createTask = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, priority = 'MEDIUM', dueDate, columnId, assigneeId } = req.body;

    // Verify column belongs to a project the user is member of
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      include: { board: { include: { project: true } } },
    });
    if (!column) return res.status(404).json({ error: 'Column not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: column.board.projectId,
          userId: req.user.id,
        },
      },
    });
    if (!membership) return res.status(403).json({ error: 'Not a project member' });

    const maxOrder = await prisma.task.aggregate({
      where: { columnId },
      _max: { order: true },
    });

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        columnId,
        assigneeId: assigneeId || null,
        creatorId: req.user.id,
        order: (maxOrder._max.order ?? -1) + 1,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        _count: { select: { comments: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'TASK_CREATED',
        details: `Created task "${task.title}"`,
        userId: req.user.id,
        projectId: column.board.projectId,
        taskId: task.id,
      },
    });

    if (assigneeId && assigneeId !== req.user.id) {
      await prisma.notification.create({
        data: {
          type: 'TASK_ASSIGNED',
          message: `You were assigned task: ${task.title}`,
          userId: assigneeId,
          projectId: column.board.projectId,
          link: `/projects/${column.board.projectId}?task=${task.id}`,
        },
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${column.board.projectId}`).emit('task:created', task);
      if (assigneeId) {
        io.to(`user:${assigneeId}`).emit('notification:new', {
          type: 'TASK_ASSIGNED',
          message: `You were assigned: ${task.title}`,
        });
      }
    }

    res.status(201).json({ message: 'Task created', task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

const updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title, description, priority, dueDate, assigneeId } = req.body;

    const existing = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: existing.column.board.projectId,
          userId: req.user.id,
        },
      },
    });
    if (!membership) return res.status(403).json({ error: 'Not a project member' });

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (priority !== undefined) data.priority = priority;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (assigneeId !== undefined) data.assigneeId = assigneeId || null;

    const task = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        _count: { select: { comments: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'TASK_UPDATED',
        details: `Updated task "${task.title}"`,
        userId: req.user.id,
        projectId: existing.column.board.projectId,
        taskId: task.id,
      },
    });

    if (assigneeId && assigneeId !== existing.assigneeId && assigneeId !== req.user.id) {
      await prisma.notification.create({
        data: {
          type: 'TASK_ASSIGNED',
          message: `You were assigned task: ${task.title}`,
          userId: assigneeId,
          projectId: existing.column.board.projectId,
          link: `/projects/${existing.column.board.projectId}?task=${task.id}`,
        },
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${existing.column.board.projectId}`).emit('task:updated', task);
    }

    res.json({ message: 'Task updated', task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

const moveTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { columnId, order } = req.body;

    const existing = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: existing.column.board.projectId,
          userId: req.user.id,
        },
      },
    });
    if (!membership) return res.status(403).json({ error: 'Not a project member' });

    // Verify target column
    const targetCol = await prisma.column.findUnique({
      where: { id: columnId },
      include: { board: true },
    });
    if (!targetCol || targetCol.board.projectId !== existing.column.board.projectId) {
      return res.status(400).json({ error: 'Invalid target column' });
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        columnId,
        order: order ?? 0,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        _count: { select: { comments: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'TASK_MOVED',
        details: `Moved task "${task.title}" to ${targetCol.name}`,
        userId: req.user.id,
        projectId: existing.column.board.projectId,
        taskId: task.id,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${existing.column.board.projectId}`).emit('task:moved', {
        task,
        fromColumnId: existing.columnId,
        toColumnId: columnId,
      });
    }

    res.json({ message: 'Task moved', task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move task' });
  }
};

const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const existing = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: existing.column.board.projectId,
          userId: req.user.id,
        },
      },
    });
    if (!membership) return res.status(403).json({ error: 'Not a project member' });

    await prisma.task.delete({ where: { id: taskId } });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${existing.column.board.projectId}`).emit('task:deleted', {
        taskId,
        columnId: existing.columnId,
      });
    }

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

const getTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
        column: { include: { board: true } },
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: task.column.board.projectId,
          userId: req.user.id,
        },
      },
    });
    if (!membership) return res.status(403).json({ error: 'Not a project member' });

    res.json({ task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
};

module.exports = {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getTask,
};
