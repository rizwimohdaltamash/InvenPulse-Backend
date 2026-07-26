const express = require('express');
const router = express.Router();

const bcrypt = require('bcryptjs');
const { normalizeRole } = require('../utils/roles');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const User = require('../models/User');

const searchableRoles = ['site_engineer', 'billing_engineer'];
const allowedEngineerRoles = ['site_engineer', 'billing_engineer'];

router.post('/create', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields (name, email, password, role) are required' });
    }

    const normalizedRole = normalizeRole(role);
    if (!allowedEngineerRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role. You can only create Billing or Site engineer accounts.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const existing = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(String(password), salt);

    const user = new User({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: hash,
      role: normalizedRole,
      createdBy: req.user.id,
      initialPassword: String(password),
      teamIds: req.user.teamIds || [],
      projectIds: req.user.projectIds || [],
    });
    await user.save();

    res.json({
      message: 'Engineer account created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamIds: user.teamIds || [],
        projectIds: user.projectIds || [],
      },
    });
  } catch (error) {
    console.error('Error creating engineer account:', error);
    res.status(500).json({ message: 'Server error while creating account' });
  }
});

router.get('/registered-engineers', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const engineers = await User.find({
      role: { $in: ['site_engineer', 'billing_engineer'] },
      createdBy: req.user.id,
    })
      .select('name email role initialPassword createdAt createdBy teamIds projectIds')
      .sort({ createdAt: -1 });

    res.json(engineers.map(u => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      password: u.initialPassword || 'Not saved (Click Reset to assign)',
      createdAt: u.createdAt,
      isCreatedByMe: String(u.createdBy) === String(req.user.id),
    })));
  } catch (error) {
    console.error('Error fetching registered engineers:', error);
    res.status(500).json({ message: 'Server error while fetching engineers' });
  }
});

router.post('/reset-password', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: 'User ID and new password (min 6 chars) required' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(String(newPassword), salt);

    const user = await User.findOneAndUpdate(
      { _id: userId, createdBy: req.user.id },
      { password: hash, initialPassword: String(newPassword) },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'Engineer not found' });
    }

    res.json({ message: 'Password updated successfully', password: user.initialPassword });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Server error while resetting password' });
  }
});

router.put('/:id', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Engineer not found' });
    }

    if (String(user.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only edit engineer accounts created by your organization' });
    }

    if (!allowedEngineerRoles.includes(normalizeRole(user.role))) {
      return res.status(403).json({ message: 'You can only edit engineer accounts' });
    }

    if (name && String(name).trim()) {
      user.name = String(name).trim();
    }

    if (email && String(email).trim()) {
      const newEmail = String(email).trim().toLowerCase();
      if (newEmail !== user.email) {
        const existing = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
        if (existing) {
          return res.status(409).json({ message: 'Email is already taken by another account' });
        }
        user.email = newEmail;
      }
    }

    if (role && String(role).trim()) {
      const normRole = normalizeRole(role);
      if (!allowedEngineerRoles.includes(normRole)) {
        return res.status(400).json({ message: 'Invalid role. Can only assign engineer roles.' });
      }
      user.role = normRole;
    }

    if (password && String(password).trim()) {
      const pwdStr = String(password).trim();
      if (pwdStr.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long' });
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(pwdStr, salt);
      user.initialPassword = pwdStr;
    }

    await user.save();

    res.json({
      message: 'Engineer account updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        password: user.initialPassword || 'Not saved (Click Reset to assign)',
      },
    });
  } catch (error) {
    console.error('Error updating engineer:', error);
    res.status(500).json({ message: 'Server error while updating engineer account' });
  }
});

router.delete('/:id', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Engineer not found' });
    }

    if (String(user.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only delete engineer accounts created by your organization' });
    }

    if (!allowedEngineerRoles.includes(normalizeRole(user.role))) {
      return res.status(403).json({ message: 'You can only delete engineer accounts' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Engineer account deleted successfully' });
  } catch (error) {
    console.error('Error deleting engineer:', error);
    res.status(500).json({ message: 'Server error while deleting engineer account' });
  }
});

router.get('/search', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const queryText = String(req.query.q || '').trim();
    if (!queryText) {
      return res.json({ users: [] });
    }

    const query = {
      role: { $in: searchableRoles },
      createdBy: req.user.id,
      $or: [
        { name: new RegExp(queryText, 'i') },
        { email: new RegExp(queryText, 'i') },
      ],
    };

    const users = await User.find(query)
      .select('name email role teamIds')
      .sort({ name: 1 })
      .limit(20);

    res.json({
      users: users.map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamIds: user.teamIds || [],
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
