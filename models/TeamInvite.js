const mongoose = require('mongoose');

const teamInviteSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
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

teamInviteSchema.index({ teamId: 1, receiverId: 1, status: 1 });
teamInviteSchema.index({ senderId: 1, status: 1 });

module.exports = mongoose.model('TeamInvite', teamInviteSchema);
