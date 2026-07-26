const mongoose = require('mongoose');

const laborSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
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

laborSchema.index({ name: 'text', phone: 'text' });
laborSchema.index({ isActive: 1 });
laborSchema.index({ projectId: 1 });

module.exports = mongoose.model('Labor', laborSchema);
