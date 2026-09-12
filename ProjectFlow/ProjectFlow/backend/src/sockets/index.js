const { verifyToken } = require('../utils/auth');
const prisma = require('../utils/prisma');

function setupSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true, email: true },
      });
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.user.id})`);

    // Join personal room for notifications
    socket.join(`user:${socket.user.id}`);

    // Join project rooms
    socket.on('project:join', async (projectId) => {
      try {
        const membership = await prisma.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId,
              userId: socket.user.id,
            },
          },
        });
        if (membership) {
          socket.join(`project:${projectId}`);
          socket.emit('project:joined', { projectId });
        }
      } catch (err) {
        console.error('Join project error:', err);
      }
    });

    socket.on('project:leave', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    // Typing indicator for comments
    socket.on('comment:typing', ({ projectId, taskId }) => {
      socket.to(`project:${projectId}`).emit('comment:typing', {
        taskId,
        user: { id: socket.user.id, name: socket.user.name },
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
    });
  });
}

module.exports = setupSockets;
