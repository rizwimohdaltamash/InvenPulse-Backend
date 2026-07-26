const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireSiteEngineer = require('../middleware/requireSiteEngineer');
const Labor = require('../models/Labor');

async function checkLaborAccess(labor, user) {
  if (!labor) return false;
  if (String(labor.createdBy) === String(user.id)) return true;
  if (labor.projectId) {
    const Project = require('../models/Project');
    const project = await Project.findById(labor.projectId);
    if (project) {
      if (String(project.createdBy) === String(user.id)) return true;
      if (project.members?.some((m) => String(m.user) === String(user.id))) return true;
    }
  }
  return false;
}

router.get('/', auth, async (req, res) => {
  try {
    const { search = '', onlyActive = true } = req.query;
    const filter = {};

    if (onlyActive === 'true') {
      filter.isActive = true;
    }

    const Project = require('../models/Project');
    const userProjects = await Project.find({
      $or: [{ createdBy: req.user.id }, { 'members.user': req.user.id }],
    }).select('_id');
    const allowedProjectIds = userProjects.map((p) => p._id);

    if (req.query.projectId) {
      if (!allowedProjectIds.some((id) => String(id) === String(req.query.projectId))) {
        return res.status(403).json({ message: 'Access denied to this project' });
      }
      filter.projectId = req.query.projectId;
    } else {
      filter.$or = [{ projectId: { $in: allowedProjectIds } }, { createdBy: req.user.id }];
    }

    let query = Labor.find(filter);
    if (search) {
      query = query.find({ $text: { $search: search } });
    }

    const labors = await query.sort({ createdAt: -1 }).populate('createdBy', 'name email');
    res.json({ labors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const labor = await Labor.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!labor) {
      return res.status(404).json({ message: 'Labor not found' });
    }
    if (!(await checkLaborAccess(labor, req.user))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ labor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/bulk', requireSiteEngineer, async (req, res) => {
  try {
    const labors = Array.isArray(req.body.labors) ? req.body.labors : [];
    const projectId = req.body.projectId;
    if (!projectId) return res.status(400).json({ message: 'projectId is required' });

    // Ensure requester is a member of the project or is the project creator
    const Project = require('../models/Project');
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const isCreator = String(project.createdBy) === String(req.user.id);
    const isMember = project.members.some((m) => String(m.user) === String(req.user.id));
    if (!isCreator && !isMember) {
      return res.status(403).json({ message: 'You are not a member of this project' });
    }
    if (labors.length === 0) {
      return res.status(400).json({ message: 'No labor entries provided' });
    }

    const normalizedEntries = labors
      .map((entry) => ({
        name: String(entry?.name || '').trim(),
        phone: String(entry?.phone || '').trim(),
      }))
      .filter((entry) => entry.name && entry.phone);

    if (normalizedEntries.length === 0) {
      return res.status(400).json({ message: 'Labor entries are invalid' });
    }
    for (const entry of normalizedEntries) {
      if (!/^\d{10}$/.test(entry.phone)) {
        return res.status(400).json({ message: `Phone number for ${entry.name} must be exactly 10 digits` });
      }
    }

    const createdEntries = [];
    for (const entry of normalizedEntries) {
      const labor = new Labor({
        name: entry.name,
        phone: entry.phone,
        projectId,
        createdBy: req.user.id,
      });
      await labor.save();
      await labor.populate({ path: 'createdBy', select: 'name email' });
      createdEntries.push(labor);
    }

    res.status(201).json({
      message: 'Labor entries created successfully',
      labors: createdEntries,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', requireSiteEngineer, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const labor = await Labor.findById(req.params.id);

    if (!labor) {
      return res.status(404).json({ message: 'Labor not found' });
    }
    if (!(await checkLaborAccess(labor, req.user))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (name !== undefined) labor.name = String(name).trim();
    if (phone !== undefined) {
      const trimmedPhone = String(phone).trim();
      if (!/^\d{10}$/.test(trimmedPhone)) {
        return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
      }
      labor.phone = trimmedPhone;
    }

    labor.updatedBy = req.user.id;
    labor.updatedAt = new Date();

    await labor.save();
    await labor.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' },
    ]);

    res.json({ message: 'Labor updated successfully', labor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/delete', requireSiteEngineer, async (req, res) => {
  try {
    const labor = await Labor.findById(req.params.id);
    if (!labor) {
      return res.status(404).json({ message: 'Labor not found' });
    }
    if (!(await checkLaborAccess(labor, req.user))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    labor.isActive = false;
    labor.updatedBy = req.user.id;
    labor.updatedAt = new Date();

    await labor.save();

    res.json({ message: 'Labor deleted successfully', labor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
