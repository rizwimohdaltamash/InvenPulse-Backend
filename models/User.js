const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  initialPassword: { type: String }, // Stored for Project Manager to view and copy credentials
  teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
