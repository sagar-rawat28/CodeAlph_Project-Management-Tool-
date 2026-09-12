const prisma = require('../utils/prisma');

const requireProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.body.projectId || req.query.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: req.user.id,
        },
      },
    });

    if (!membership) {
      // Also check if owner
      const project = await prisma.project.findFirst({
        where: { id: projectId, ownerId: req.user.id },
      });
      if (!project) {
        return res.status(403).json({ error: 'You are not a member of this project' });
      }
      req.membership = { role: 'OWNER', projectId };
    } else {
      req.membership = membership;
    }

    req.projectId = projectId;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(403).json({ error: 'No membership found' });
    }
    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { requireProjectMember, requireRole };
