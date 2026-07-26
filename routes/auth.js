const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const auth = require('../middleware/auth');
const { normalizeRole, ROLE_OPTIONS, ROLE_VALUES } = require('../utils/roles');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const allowedRoles = ROLE_VALUES;

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

    const normalizedRole = normalizeRole(role || 'project_manager');
    if (normalizedRole !== 'project_manager') {
      return res.status(403).json({ message: 'Only Project Manager accounts can be registered via public sign-up. Engineers must be created by their Project Manager.' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const user = new User({ name, email, password: hash, role: normalizedRole });
    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: normalizedRole },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: normalizedRole, teamIds: user.teamIds || [] } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const normalizedRole = normalizeRole(user.role);
    if (normalizedRole && normalizedRole !== user.role) {
      user.role = normalizedRole;
      await user.save();
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: normalizedRole || user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: normalizedRole || user.role, teamIds: user.teamIds || [] } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email role teamIds');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const normalizedRole = normalizeRole(user.role);
    if (normalizedRole && normalizedRole !== user.role) {
      user.role = normalizedRole;
      await user.save();
    }

    res.json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: normalizedRole || user.role,
          teamIds: user.teamIds || [],
        },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/me/role', auth, async (req, res) => {
  try {
    const { role } = req.body;
    const normalizedRole = normalizeRole(role);

    if (!normalizedRole || !allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { role: normalizedRole } },
      { new: true, runValidators: true }
    ).select('name email role teamIds');

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: normalizedRole,
          teamIds: user.teamIds || [],
        },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/roles', auth, async (req, res) => {
  try {
    res.json({ roles: ROLE_OPTIONS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
