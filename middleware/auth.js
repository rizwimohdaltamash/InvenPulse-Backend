const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizeRole } = require('../utils/roles');

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token' });

  const parts = authHeader.split(' ');
  if (parts.length !== 2) return res.status(401).json({ message: 'Invalid token format' });

  const token = parts[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;

    User.findById(userId)
      .select('name email role teamIds projectIds')
      .then((user) => {
        if (!user) {
          return res.status(401).json({ message: 'Invalid token' });
        }

        const normalizedRole = normalizeRole(user.role);
        req.user = {
          id: user._id,
          email: user.email,
          name: user.name,
          role: normalizedRole || user.role,
          teamIds: Array.isArray(user.teamIds) ? user.teamIds : [],
          projectIds: Array.isArray(user.projectIds) ? user.projectIds : [],
        };
        next();
      })
      .catch(() => res.status(500).json({ message: 'Server error' }));
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
