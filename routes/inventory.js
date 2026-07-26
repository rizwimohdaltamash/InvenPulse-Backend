const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireBillingEngineer = require('../middleware/requireBillingEngineer');
const InventoryItem = require('../models/InventoryItem');

// Predefined units
const PREDEFINED_UNITS = ['bags', 'pieces', 'cubic meter', 'tons', 'liters', 'kg', 'meter'];
const CATEGORIES = ['Construction Material', 'Equipment', 'Labor', 'Other'];
const MATERIAL_TEMPLATES = [
  { key: 'cement', label: 'Cement', unit: 'bags', category: 'Construction Material', aliases: ['opc', 'ppc'] },
  { key: 'sand', label: 'Sand', unit: 'cubic meter', category: 'Construction Material', aliases: ['river sand', 'm-sand'] },
  { key: 'bricks', label: 'Bricks', unit: 'pieces', category: 'Construction Material', aliases: ['brick', 'brick pieces'] },
  { key: 'steel', label: 'Steel Rods', unit: 'tons', category: 'Construction Material', aliases: ['rebar', 'tmt'] },
  { key: 'paint', label: 'Paint', unit: 'liters', category: 'Construction Material', aliases: ['emulsion', 'primer'] },
  { key: 'tiles', label: 'Tiles', unit: 'pieces', category: 'Construction Material', aliases: ['floor tile', 'wall tile'] },
  { key: 'gravel', label: 'Gravel', unit: 'cubic meter', category: 'Construction Material', aliases: ['aggregate', 'stone chips'] },
  { key: 'waterproofing', label: 'Waterproofing Material', unit: 'liters', category: 'Construction Material', aliases: ['sealant', 'membrane'] },
];

async function checkItemAccess(item, user) {
  if (!item) return false;
  if (String(item.createdBy) === String(user.id)) return true;
  if (item.projectId) {
    const Project = require('../models/Project');
    const project = await Project.findById(item.projectId);
    if (project) {
      if (String(project.createdBy) === String(user.id)) return true;
      if (project.members?.some((m) => String(m.user) === String(user.id))) return true;
    }
  }
  return false;
}

// Inventory configuration
router.get('/config/units', auth, (req, res) => {
  res.json({
    units: PREDEFINED_UNITS,
    categories: CATEGORIES,
  });
});

router.get('/config/materials', auth, (req, res) => {
  res.json({
    materials: MATERIAL_TEMPLATES,
  });
});

// Get all inventory items (accessible to all authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const { search = '', category = '', onlyActive = true } = req.query;

    const filter = {};
    if (onlyActive === 'true') {
      filter.isActive = true;
    }
    if (category) {
      filter.category = category;
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

    let query = InventoryItem.find(filter);

    if (search) {
      query = query.find({ $text: { $search: search } });
    }

    const items = await query.sort({ createdAt: -1 }).populate('createdBy', 'name email');

    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single inventory item
router.get('/:id', auth, async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    if (!(await checkItemAccess(item, req.user))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add inventory item (only Billing Engineer)
router.post('/', requireBillingEngineer, async (req, res) => {
  try {
    const { itemName, unit, customUnit, category, description, thresholdQuantity, projectId } = req.body;

    if (!itemName || !unit || !category) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

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

    if (unit === 'custom' && !customUnit) {
      return res.status(400).json({ message: 'Custom unit name is required' });
    }

    // Check if item already exists
    const existing = await InventoryItem.findOne({
      itemName: itemName.toLowerCase(),
      isActive: true,
      projectId,
    });

    if (existing) {
      return res.status(409).json({ message: 'Inventory item already exists' });
    }

    const item = new InventoryItem({
      itemName: itemName.toLowerCase(),
      unit: unit === 'custom' ? 'custom' : unit,
      customUnit: unit === 'custom' ? customUnit : null,
      category,
      description: description || '',
      thresholdQuantity: thresholdQuantity || 0,
      projectId,
      createdBy: req.user.id,
    });

    await item.save();
    await item.populate({ path: 'createdBy', select: 'name email' });

    console.log(`📦 [INVENTORY] New item created: ${itemName} by ${req.user.id}`);

    res.status(201).json({ message: 'Inventory item created successfully', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update inventory item (only Billing Engineer)
router.put('/:id', requireBillingEngineer, async (req, res) => {
  try {
    const { itemName, unit, customUnit, category, description, thresholdQuantity } = req.body;

    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    if (!(await checkItemAccess(item, req.user))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (itemName) item.itemName = itemName.toLowerCase();
    if (unit) {
      item.unit = unit === 'custom' ? 'custom' : unit;
      item.customUnit = unit === 'custom' ? customUnit : null;
    }
    if (category) item.category = category;
    if (description !== undefined) item.description = description;
    if (thresholdQuantity !== undefined) item.thresholdQuantity = thresholdQuantity;

    item.updatedBy = req.user.id;
    item.updatedAt = new Date();

    await item.save();
    await item.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' },
    ]);

    console.log(`📝 [INVENTORY] Item updated: ${item._id} by ${req.user.id}`);

    res.json({ message: 'Inventory item updated successfully', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Disable inventory item (soft delete - only Billing Engineer)
router.patch('/:id/disable', requireBillingEngineer, async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    if (!(await checkItemAccess(item, req.user))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    item.isActive = false;
    item.updatedBy = req.user.id;
    item.updatedAt = new Date();

    await item.save();

    console.log(`🔒 [INVENTORY] Item disabled: ${item._id} by ${req.user.id}`);

    res.json({ message: 'Inventory item disabled successfully', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Re-enable inventory item (only Billing Engineer)
router.patch('/:id/enable', requireBillingEngineer, async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    if (!(await checkItemAccess(item, req.user))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    item.isActive = true;
    item.updatedBy = req.user.id;
    item.updatedAt = new Date();

    await item.save();

    console.log(`✅ [INVENTORY] Item enabled: ${item._id} by ${req.user.id}`);

    res.json({ message: 'Inventory item enabled successfully', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
