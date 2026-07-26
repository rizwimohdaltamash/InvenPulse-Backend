const mongoose = require('mongoose');

const projectInviteSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedRole: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    respondedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

projectInviteSchema.index({ projectId: 1, receiverId: 1, status: 1 });
projectInviteSchema.index({ senderId: 1, status: 1 });

module.exports = mongoose.model('ProjectInvite', projectInviteSchema);