const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { normalizeRole } = require('../utils/roles');
const Team = require('../models/Team');
const TeamInvite = require('../models/TeamInvite');
const User = require('../models/User');

const teamMemberRoles = ['project_manager', 'billing_engineer', 'site_engineer'];
const inviteableRoles = ['billing_engineer', 'site_engineer'];

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

router.get('/my', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('teamIds role name email');
    if (!user) {
      return res.json({ teams: [] });
    }

    const teamIds = Array.isArray(user.teamIds) ? user.teamIds : [];
    const ownedTeams = await Team.find({ createdBy: req.user.id });
    const ownedTeamIds = ownedTeams.map((team) => team._id);
    const mergedTeamIds = [...new Set([...teamIds.map(String), ...ownedTeamIds.map(String)])];

    if (ownedTeamIds.length > 0) {
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { teamIds: { $each: ownedTeamIds } } });
    }

    if (mergedTeamIds.length === 0) {
      return res.json({ teams: [] });
    }

    const teams = await Team.find({ _id: { $in: mergedTeamIds } })
      .populate('createdBy', 'name email role')
      .populate('members.user', 'name email role teamIds');

    res.json({ teams });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my/projects', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('teamIds role name email');
    const Project = require('../models/Project');

    // Projects where user's teams are owners
    const teamIds = Array.isArray(user?.teamIds) ? user.teamIds : [];
    const ownedTeams = await Team.find({ createdBy: req.user.id }).select('_id');
    const mergedTeamIds = [...new Set([...teamIds.map(String), ...ownedTeams.map((team) => String(team._id))])];
    if (ownedTeams.length > 0) {
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { teamIds: { $each: ownedTeams.map((team) => team._id) } } });
    }
    const projects = await Project.find({ teamId: { $in: mergedTeamIds } })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .populate('teamId', 'teamName teamCode createdBy');

    // Also include projects created by this user (manager)
    const ownProjects = await Project.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .populate('teamId', 'teamName teamCode createdBy');

    // Merge unique projects
    const map = new Map();
    for (const p of [...projects, ...ownProjects]) map.set(String(p._id), p);

    // Fetch teams for user's teams
    const teams = await Team.find({ _id: { $in: mergedTeamIds } })
      .populate('createdBy', 'name email role')
      .populate('members.user', 'name email role teamIds');

    res.json({ teams, projects: Array.from(map.values()) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const teamName = String(req.body.teamName || '').trim();
    if (!teamName) {
      return res.status(400).json({ message: 'Team name is required' });
    }

    const teamCode = await generateUniqueTeamCode(teamName);
    const team = await Team.create({
      teamName,
      teamNameKey: teamName.toLowerCase(),
      teamCode,
      createdBy: req.user.id,
      members: [{ user: req.user.id, role: 'project_manager' }],
    });

    await User.findByIdAndUpdate(req.user.id, { $addToSet: { teamIds: team._id } });

    res.status(201).json({ team });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/invites', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const { teamId, receiverId, requestedRole } = req.body;
    const normalizedRole = normalizeRole(requestedRole);

    if (!teamId || !receiverId || !normalizedRole) {
      return res.status(400).json({ message: 'teamId, receiverId and requestedRole are required' });
    }

    if (!inviteableRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Requested role is not inviteable' });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    if (String(team.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only invite members to your own team' });
    }

    const receiver = await User.findById(receiverId).select('name email role teamIds createdBy');
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });
    if (String(receiver.createdBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only invite engineers created by your organization' });
    }

    const receiverRole = normalizeRole(receiver.role);
    if (!teamMemberRoles.includes(receiverRole) || receiverRole === 'project_manager') {
      return res.status(400).json({ message: 'Receiver must be an engineer' });
    }

    if (Array.isArray(receiver.teamIds) && receiver.teamIds.some((t) => String(t) === String(team._id))) {
      return res.status(409).json({ message: 'Receiver already belongs to this team' });
    }

    const duplicate = await TeamInvite.findOne({
      teamId,
      receiverId,
      status: 'pending',
    });

    if (duplicate) {
      return res.status(409).json({ message: 'Invite already pending for this user' });
    }

    const invite = await TeamInvite.create({
      teamId,
      senderId: req.user.id,
      receiverId,
      requestedRole: normalizedRole,
    });

    const populatedInvite = await TeamInvite.findById(invite._id)
      .populate('teamId', 'teamName teamCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role teamIds');

    res.status(201).json({ invite: populatedInvite });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/invites/inbox', auth, async (req, res) => {
  try {
    const invites = await TeamInvite.find({ receiverId: req.user.id, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('teamId', 'teamName teamCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role teamIds');

    res.json({ invites });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/invites/sent', auth, requireRole('project_manager'), async (req, res) => {
  try {
    const invites = await TeamInvite.find({ senderId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('teamId', 'teamName teamCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role teamIds');

    res.json({ invites });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:teamId', auth, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId)
      .populate('createdBy', 'name email role')
      .populate('members.user', 'name email role teamId');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    if (String(team.createdBy) !== String(req.user.id) && !team.members?.some((m) => String(m.user) === String(req.user.id))) {
      return res.status(403).json({ message: 'Access denied to this team' });
    }

    res.json({ team });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/invites/:id/accept', auth, async (req, res) => {
  try {
    const invite = await TeamInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (String(invite.receiverId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only accept your own invite' });
    }
    if (invite.status !== 'pending') {
      return res.status(409).json({ message: 'Invite already handled' });
    }

    const team = await Team.findById(invite.teamId);
    const receiver = await User.findById(req.user.id).select('teamIds role');
    if (!team || !receiver) return res.status(404).json({ message: 'Team or user not found' });

    if (!team.members.some((member) => String(member.user) === String(receiver._id))) {
      team.members.push({ user: receiver._id, role: invite.requestedRole });
    }

    await team.save();
    await User.findByIdAndUpdate(receiver._id, { $addToSet: { teamIds: team._id }, $set: { role: normalizeRole(invite.requestedRole) || receiver.role } });

    invite.status = 'accepted';
    invite.respondedAt = new Date();
    await invite.save();

    const populatedInvite = await TeamInvite.findById(invite._id)
      .populate('teamId', 'teamName teamCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role teamIds');

    res.json({ invite: populatedInvite, team });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/invites/:id/reject', auth, async (req, res) => {
  try {
    const invite = await TeamInvite.findById(req.params.id);
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

    const populatedInvite = await TeamInvite.findById(invite._id)
      .populate('teamId', 'teamName teamCode')
      .populate('senderId', 'name email role')
      .populate('receiverId', 'name email role teamIds');

    res.json({ invite: populatedInvite });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
