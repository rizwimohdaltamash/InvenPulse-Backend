const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const User = require('../models/User');
const Project = require('../models/Project');
const Team = require('../models/Team');
const ProjectInvite = require('../models/ProjectInvite');
const { normalizeRole } = require('../utils/roles');

const allowedStatuses = ['Started', 'Active', 'Completed'];

function generateTeamCode(teamName) {
  const prefix = String(teamName || 'TEAM')
    .trim()
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 3)
    .toUpperCase() || 'TEA';
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${suffix}`;
}

async function generateUniqueTeamCode(teamName) {
  let attempts = 0;
  while (attempts < 8) {
    const teamCode = generateTeamCode(teamName);
    const existing = await Team.findOne({ teamCode });
    if (!existing) return teamCode;
    attempts += 1;
  }
  throw new Error('Failed to generate team code');
}

function generateProjectCode(projectName) {
  const prefix = String(projectName || 'PRJ')
    .trim()
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 3)
    .toUpperCase() || 'PRJ';
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${suffix}`;
}

async function generateUniqueProjectCode(projectName) {
  let attempts = 0;
  while (attempts < 8) {
    const projectCode = generateProjectCode(projectName);
    const existing = await Project.findOne({ projectCode });
    if (!existing) return projectCode;
    attempts += 1;
  }
  throw new Error('Failed to generate project code');
}

function projectNameKey(projectName) {
  return String(projectName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseLocations(locations) {
  if (Array.isArray(locations)) {
    return locations.map((location) => String(location).trim()).filter(Boolean);
  }

  if (typeof locations === 'string') {
    return locations
      .split(',')
      .map((location) => location.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeManagers(managers) {
  if (!Array.isArray(managers)) return [];
  return managers
    .map((manager) => ({
      name: String(manager?.name || '').trim(),
      role: normalizeRole(manager?.role),
      email: String(manager?.email || '').trim(),
    }))
    .filter((manager) => manager.name && manager.role && manager.email);
}

function validatePhone(phone) {
  return /^\d{10}$/.test(String(phone || '').trim());
}

function buildPayload(body) {
  const projectName = String(body.projectName || '').trim();
  const locations = parseLocations(body.locations);
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const expectedEndDate = body.expectedEndDate ? new Date(body.expectedEndDate) : null;
  const status = String(body.status || '').trim();
  const client = body.client || {};
  const assignedManagers = normalizeManagers(body.assignedManagers);

  return {
    projectName,
    projectNameKey: projectNameKey(projectName),
    locations,
    startDate,
    expectedEndDate,
    status,
    client: {
      name: String(client.name || '').trim(),
      phone: String(client.phone || '').trim(),
      email: String(client.email || '').trim(),
      companyName: String(client.companyName || '').trim(),
    },
    assignedManagers,
  };
}

function validatePayload(payload) {
  if (!payload.projectName) return 'Project name is required';
  if (!payload.locations.length) return 'At least one location is required';
  if (!payload.startDate || Number.isNaN(payload.startDate.getTime())) return 'Valid start date is required';
  if (!payload.expectedEndDate || Number.isNaN(payload.expectedEndDate.getTime())) return 'Valid expected end date is required';
  if (!allowedStatuses.includes(payload.status)) return 'Invalid status';
  if (!payload.client.name) return 'Client name is required';
  if (!payload.client.phone) return 'Client phone number is required';
  if (!validatePhone(payload.client.phone)) return 'Client phone number is invalid';

  for (const manager of payload.assignedManagers) {
    if (!manager.name || !manager.role || !manager.email) return 'Each assigned manager must include name, role, and email';
  }

  return null;
}

async function dispatchInvitesForManagers(project, senderId) {
  if (!project || !Array.isArray(project.assignedManagers)) return;
  for (const manager of project.assignedManagers) {
    if (!manager.email) continue;
    const receiver = await User.findOne({ email: manager.email.toLowerCase() });
    if (receiver && String(receiver._id) !== String(senderId) && String(receiver.createdBy) === String(senderId)) {
      const alreadyMember = Array.isArray(project.members) && project.members.some((m) => String(m.user) === String(receiver._id));
      if (!alreadyMember) {
        const duplicate = await ProjectInvite.findOne({ projectId: project._id, receiverId: receiver._id, status: 'pending' });
        if (!duplicate) {
          await ProjectInvite.create({
            projectId: project._id,
            senderId,
            receiverId: receiver._id,
            requestedRole: manager.role || 'site_engineer',
          });
        }
      }
    }
  }
}

// Projects accessible to the authenticated user (engineers see projects for their teams)
router.get('/my', auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [{ createdBy: req.user.id }, { 'members.user': req.user.id }],
    })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .populate('members.user', 'name email role');

    if (projects.length > 0) {
      await User.findByIdAndUpdate(req.user.id, {
        $addToSet: { projectIds: { $each: projects.map((project) => project._id) } },
      });
    }

    res.json({ projects });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/invites/inbox', auth, async (req, res) => {
  try {
    const invites = await ProjectInvite.find({ receiverId: req.user.id, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('projectId', 'projectName projectCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role');

    res.json({ invites });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:projectId/invites', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const { receiverId, requestedRole } = req.body;
    const normalizedRole = normalizeRole(requestedRole);

    if (!receiverId || !normalizedRole) {
      return res.status(400).json({ message: 'receiverId and requestedRole are required' });
    }

    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (String(project.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only invite members to your own project' });
    }

    const receiver = await User.findById(receiverId).select('name email role projectIds createdBy');
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });
    if (String(receiver.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only invite engineers created by your organization' });
    }

    if (Array.isArray(project.members) && project.members.some((member) => String(member.user) === String(receiver._id))) {
      return res.status(409).json({ message: 'Receiver already belongs to this project' });
    }

    const duplicate = await ProjectInvite.findOne({ projectId: project._id, receiverId, status: 'pending' });
    if (duplicate) {
      return res.status(409).json({ message: 'Invite already pending for this user' });
    }

    const invite = await ProjectInvite.create({
      projectId: project._id,
      senderId: req.user.id,
      receiverId,
      requestedRole: normalizedRole,
    });

    const populatedInvite = await ProjectInvite.findById(invite._id)
      .populate('projectId', 'projectName projectCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role');

    res.status(201).json({ invite: populatedInvite });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:projectId/invites/sent', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (String(project.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only view invites for your own project' });
    }

    const invites = await ProjectInvite.find({ projectId: project._id, senderId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('projectId', 'projectName projectCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role');

    res.json({ invites });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/invites/:id/accept', auth, async (req, res) => {
  try {
    const invite = await ProjectInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (String(invite.receiverId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only accept your own invite' });
    }
    if (invite.status !== 'pending') {
      return res.status(409).json({ message: 'Invite already handled' });
    }

    const project = await Project.findById(invite.projectId);
    const receiver = await User.findById(req.user.id).select('projectIds role');
    if (!project || !receiver) return res.status(404).json({ message: 'Project or user not found' });

    const alreadyMember = Array.isArray(project.members) &&
      project.members.some((member) => String(member.user) === String(receiver._id));

    if (!alreadyMember) {
      await Project.findByIdAndUpdate(
        project._id,
        { $push: { members: { user: receiver._id, role: invite.requestedRole } } },
        { runValidators: false }
      );
    }

    await User.findByIdAndUpdate(receiver._id, { $addToSet: { projectIds: project._id } });

    invite.status = 'accepted';
    invite.respondedAt = new Date();
    await invite.save();

    const populatedInvite = await ProjectInvite.findById(invite._id)
      .populate('projectId', 'projectName projectCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role');

    const updatedProject = await Project.findById(project._id);
    res.json({ invite: populatedInvite, project: updatedProject });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/invites/:id/reject', auth, async (req, res) => {
  try {
    const invite = await ProjectInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (String(invite.receiverId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only reject your own invite' });
    }
    if (invite.status !== 'pending') {
      return res.status(409).json({ message: 'Invite already handled' });
    }

    invite.status = 'rejected';
    invite.respondedAt = new Date();
    await invite.save();

    const populatedInvite = await ProjectInvite.findById(invite._id)
      .populate('projectId', 'projectName projectCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role');

    res.json({ invite: populatedInvite });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.use(auth, requireRole('project_manager'));

router.get('/', async (req, res) => {
  try {
    const { search, status, client } = req.query;
    const query = { createdBy: req.user.id };

    if (status) query.status = status;
    if (client) query['client.name'] = new RegExp(client, 'i');
    if (search) {
      query.$or = [
        { projectName: new RegExp(search, 'i') },
        { 'client.name': new RegExp(search, 'i') },
        { 'client.companyName': new RegExp(search, 'i') },
      ];
    }

    const projects = await Project.find(query).sort({ createdAt: -1 });
    res.json({ projects });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (String(project.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Access denied to this project' });
    }
    res.json({ project });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const existing = await Project.findOne({ projectNameKey: payload.projectNameKey, createdBy: req.user.id });
    if (existing) return res.status(409).json({ message: 'Duplicate project not allowed' });

    const projectCode = await generateUniqueProjectCode(payload.projectName);

    const project = await Project.create({
      ...payload,
      projectCode,
      teamId: null,
      createdBy: req.user.id,
      members: [{ user: req.user.id, role: 'project_manager' }],
    });

    await User.findByIdAndUpdate(req.user.id, { $addToSet: { projectIds: project._id } });

    await dispatchInvitesForManagers(project, req.user.id);

    res.status(201).json({ project });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const projectToUpdate = await Project.findById(req.params.id);
    if (!projectToUpdate) return res.status(404).json({ message: 'Project not found' });
    if (String(projectToUpdate.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Access denied to this project' });
    }

    const existing = await Project.findOne({ projectNameKey: payload.projectNameKey, _id: { $ne: req.params.id }, createdBy: req.user.id });
    if (existing) return res.status(409).json({ message: 'Duplicate project not allowed' });

    // Allow updating teamId but only if requester owns the team
    let updateObj = { ...payload, updatedBy: req.user.id };
    if (req.body.teamId) {
      const team = await Team.findById(req.body.teamId);
      if (!team) return res.status(404).json({ message: 'Team not found' });
      if (String(team.createdBy) !== String(req.user.id)) {
        return res.status(403).json({ message: 'You can only assign projects to your own team' });
      }
      updateObj.teamId = req.body.teamId;
    }

    const project = await Project.findByIdAndUpdate(req.params.id, updateObj, { new: true, runValidators: true });

    if (!project) return res.status(404).json({ message: 'Project not found' });

    await dispatchInvitesForManagers(project, req.user.id);

    res.json({ project });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!project) return res.status(404).json({ message: 'Project not found or access denied' });
    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;