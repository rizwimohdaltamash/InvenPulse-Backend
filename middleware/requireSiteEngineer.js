const auth = require('./auth');

const requireSiteEngineer = [auth, (req, res, next) => {
  if (req.user.role !== 'site_engineer') {
    return res.status(403).json({
      message: 'Access Denied. Only Site Engineers can access this resource.',
    });
  }
  next();
}];

module.exports = requireSiteEngineer;
