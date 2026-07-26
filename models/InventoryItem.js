const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  unit: {
    type: String,
    required: true,
    enum: ['bags', 'pieces', 'cubic meter', 'tons', 'liters', 'kg', 'meter', 'custom'],
  },
  customUnit: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['Construction Material', 'Equipment', 'Labor', 'Other'],
  },
  description: {
    type: String,
    trim: true,
  },
  thresholdQuantity: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for faster searches
inventoryItemSchema.index({ itemName: 'text', category: 1 });
inventoryItemSchema.index({ isActive: 1 });
inventoryItemSchema.index({ projectId: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
