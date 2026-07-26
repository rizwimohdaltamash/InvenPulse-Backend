const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true, trim: true },
    projectNameKey: { type: String, required: true, unique: true, index: true },
    projectCode: { type: String, required: true, unique: true, index: true },
    locations: {
      type: [String],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'At least one location is required',
      },
    },
    startDate: { type: Date, required: true },
    expectedEndDate: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ['Started', 'Active', 'Completed'],
      default: 'Started',
    },
    client: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true },
      companyName: { type: String, trim: true },
    },
    assignedManagers: [
      {
        name: { type: String, required: true, trim: true },
        role: { type: String, required: true, trim: true },
        email: { type: String, required: true, trim: true },
      },
    ],
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, required: true, trim: true },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);