const prisma = require('../utils/prisma');

const createComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
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

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        taskId,
        authorId: req.user.id,
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    // Notify assignee and creator if different
    const notifyIds = new Set();
    if (task.assigneeId && task.assigneeId !== req.user.id) notifyIds.add(task.assigneeId);
    if (task.creatorId && task.creatorId !== req.user.id) notifyIds.add(task.creatorId);

    for (const uid of notifyIds) {
      await prisma.notification.create({
        data: {
          type: 'COMMENT',
          message: `${req.user.name} commented on "${task.title}"`,
          userId: uid,
          projectId: task.column.board.projectId,
          link: `/projects/${task.column.board.projectId}?task=${taskId}`,
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        action: 'COMMENT_ADDED',
        details: `Commented on "${task.title}"`,
        userId: req.user.id,
        projectId: task.column.board.projectId,
        taskId,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${task.column.board.projectId}`).emit('comment:created', {
        comment,
        taskId,
      });
      for (const uid of notifyIds) {
        io.to(`user:${uid}`).emit('notification:new', {
          type: 'COMMENT',
          message: `${req.user.name} commented on a task`,
        });
      }
    }

    res.status(201).json({ message: 'Comment added', comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        task: { include: { column: { include: { board: true } } } },
      },
    });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (comment.authorId !== req.user.id) {
      const membership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: comment.task.column.board.projectId,
            userId: req.user.id,
          },
        },
      });
      if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
        return res.status(403).json({ error: 'Not authorized to delete this comment' });
      }
    }

    await prisma.comment.delete({ where: { id: commentId } });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${comment.task.column.board.projectId}`).emit('comment:deleted', {
        commentId,
        taskId: comment.taskId,
      });
    }

    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
};

module.exports = { createComment, deleteComment };
