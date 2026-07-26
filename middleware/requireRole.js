const User = require('../models/User');
const { normalizeRole } = require('../utils/roles');

module.exports = function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const user = await User.findById(req.user.id).select('role');
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const normalizedRole = normalizeRole(user.role);
      const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

      if (!normalizedAllowedRoles.includes(normalizedRole)) {
        return res.status(403).json({ message: 'Access Denied' });
      }

      req.userRole = normalizedRole;
      next();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};