require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const inventoryRoutes = require('./routes/inventory');
const laborRoutes = require('./routes/labor');
const teamRoutes = require('./routes/teams');
const userRoutes = require('./routes/users');

const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`\n📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`   Client IP: ${req.ip}`);
  console.log(`   Headers:`, req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
  }
  next();
});

const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/labor', laborRoutes);

app.get('/', (req, res) => res.json({ ok: true, service: 'invman-auth' }));

app.listen(PORT, () => console.log(`Auth server listening on port ${PORT}`));
