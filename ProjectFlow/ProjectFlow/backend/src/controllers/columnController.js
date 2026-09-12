const prisma = require('../utils/prisma');

const createColumn = async (req, res) => {
  try {
    const { name, boardId } = req.body;
    if (!name?.trim() || !boardId) {
      return res.status(400).json({ error: 'Name and boardId required' });
    }

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { project: true },
    });
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: board.projectId, userId: req.user.id },
      },
    });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const column = await prisma.column.create({
      data: {
        name: name.trim(),
        boardId,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${board.projectId}`).emit('column:created', column);
    }

    res.status(201).json({ message: 'Column created', column });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create column' });
  }
};

const updateColumn = async (req, res) => {
  try {
    const { columnId } = req.params;
    const { name, order } = req.body;

    const column = await prisma.column.findUnique({
      where: { id: columnId },
      include: { board: true },
    });
    if (!column) return res.status(404).json({ error: 'Column not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: column.board.projectId, userId: req.user.id },
      },
    });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const data = {};
    if (name) data.name = name.trim();
    if (order !== undefined) data.order = order;

    const updated = await prisma.column.update({
      where: { id: columnId },
      data,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${column.board.projectId}`).emit('column:updated', updated);
    }

    res.json({ message: 'Column updated', column: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update column' });
  }
};

const deleteColumn = async (req, res) => {
  try {
    const { columnId } = req.params;

    const column = await prisma.column.findUnique({
      where: { id: columnId },
      include: { board: true, _count: { select: { tasks: true } } },
    });
    if (!column) return res.status(404).json({ error: 'Column not found' });

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: column.board.projectId, userId: req.user.id },
      },
    });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (column._count.tasks > 0) {
      return res.status(400).json({ error: 'Cannot delete column with tasks. Move or delete tasks first.' });
    }

    await prisma.column.delete({ where: { id: columnId } });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${column.board.projectId}`).emit('column:deleted', { columnId });
    }

    res.json({ message: 'Column deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete column' });
  }
};

module.exports = { createColumn, updateColumn, deleteColumn };
