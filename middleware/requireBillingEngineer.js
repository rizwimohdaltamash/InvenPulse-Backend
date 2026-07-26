const auth = require('./auth');

const requireBillingEngineer = [auth, (req, res, next) => {
  if (req.user.role !== 'billing_engineer') {
    return res.status(403).json({
      message: 'Access Denied. Only Billing Engineers can access this resource.',
    });
  }
  next();
}];

module.exports = requireBillingEngineer;
