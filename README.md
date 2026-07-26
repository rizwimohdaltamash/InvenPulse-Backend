# ⚡ InvenPulse™ — Backend API Service (Node.js & Express)

*High-Performance REST API, Authentication Engine & Cloud Data Store*

---

## 🛠️ Technologies & Ecosystem

![Node.js](https://img.shields.io/badge/Node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Mongoose](https://img.shields.io/badge/Mongoose-880000?style=for-the-badge&logo=mongoose&logoColor=white)
![JSON Web Tokens](https://img.shields.io/badge/JWT_Tokens-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![REST API](https://img.shields.io/badge/RESTful_API-005571?style=for-the-badge&logo=fastapi&logoColor=white)
![Bcrypt](https://img.shields.io/badge/Bcrypt_Security-4A154B?style=for-the-badge&logo=letsencrypt&logoColor=white)
![NPM](https://img.shields.io/badge/NPM_Package-CB3837?style=for-the-badge&logo=npm&logoColor=white)

---

## 🌟 Overview

**InvenPulse™ Server** is the core backend engine powering the InvenPulse construction and inventory management suite. Built on top of **Node.js**, **Express**, and **MongoDB**, this server provides robust RESTful APIs, stateless JSON Web Token (JWT) authentication, role-based endpoint security, and real-time database transactions for construction sites and workforce management.

---

## 🏛️ Server Architecture & Directory Structure

The backend follows a modular **Model-View-Controller (MVC) / Router-Service pattern**, ensuring maintainability and clean separation between database schemas, business routing logic, and security middleware:

```
server/
 ┣ middleware/       # Security & Authorization Middlewares (JWT Bearer Verification, Role Checks)
 ┣ models/           # Mongoose Database Schemas (User, Project, Inventory, Labor, Invitation)
 ┣ routes/           # RESTful API Endpoints (/auth, /projects, /inventory, /labor, /users, /invitations)
 ┣ utils/            # Helper Functions & Error Handlers
 ┣ index.js          # Express Server Setup, CORS Configuration & Database Connection
 ┗ package.json      # Dependencies & Script Definitions
```

### Key Architectural Highlights:
- **Stateless JWT Authentication**: Every protected request is validated via an `Authorization: Bearer <token>` header. Tokens are signed with custom expiration timelines and validated against user identities without requiring server-side session memory.
- **Optimized for Client-Side Caching & Stale-While-Revalidate**: REST endpoints are structured with lightweight JSON payloads and fast MongoDB query execution, empowering the InvenPulse™ client application to perform sub-millisecond local RAM/disk caching with seamless background revalidation and automatic write-invalidation.
- **Granular Role-Based Access Control (RBAC)**: Custom middlewares enforce strict operational boundaries:
  - Endpoints like project creation and engineer onboarding are strictly restricted to authenticated **Project Managers**.
  - Inventory modification and labor attendance logging are protected so that only assigned **Billing Engineers** and **Site Engineers** can submit data for their respective sites.
- **Relational Integrity in NoSQL**: Leverages Mongoose object references (`ObjectId`) to link construction projects directly with their assigned engineers, inventory catalogs, labor logs, and pending join invitations.
- **Data Sanitization & Encryption**: Passwords are securely hashed using `bcrypt` with high salt rounds prior to persistence. All input payloads are validated against schema constraints to prevent injection or malformed data.

---

## 🚀 Core API Modules & Endpoints

### 1. 🔐 Authentication & Identity Module (`/api/auth`)
- `POST /api/auth/signup`: Register a new Project Manager or Engineer account with encrypted password storage.
- `POST /api/auth/login`: Authenticate credentials and issue a signed JWT session token along with user profile metadata.
- `POST /api/auth/create-engineer`: Dedicated Project Manager endpoint to onboard and register field Billing/Site Engineers.

### 2. 🏢 Construction Projects Module (`/api/projects`)
- `GET /api/projects`: Retrieve all construction sites owned by or assigned to the authenticated user.
- `POST /api/projects`: Create a new construction project with client details, budgets, and location data.
- `PUT /api/projects/:id` / `DELETE /api/projects/:id`: Update project specifications or decommission completed sites.

### 3. 🤝 Team Management & Invitations Module (`/api/invitations` & `/api/users`)
- `GET /api/users/engineers`: Query and search registered engineers across the enterprise directory.
- `POST /api/invitations`: Send a project join invitation to a registered Billing or Site Engineer.
- `PUT /api/invitations/:id/respond`: Allow engineers to accept or reject pending project assignments.

### 4. 📦 Inventory & Material Logging Module (`/api/inventory`)
- `GET /api/inventory/project/:projectId`: Fetch full material inventory and quantity logs for a specific construction site.
- `POST /api/inventory`: Add new construction materials (e.g., cement, steel, lumber) with quantities and unit pricing.
- `PUT /api/inventory/:id` / `DELETE /api/inventory/:id`: Audit, adjust, or remove stock items.

### 5. 👷 Site Labor & Attendance Module (`/api/labor`)
- `GET /api/labor/project/:projectId`: Fetch historical labor attendance and shift logs for a site.
- `POST /api/labor`: Record daily workforce numbers, worker trades, wages, and shift durations.

---

## 🎯 Technical Benefits & Enterprise Use Cases

| Feature Area | Technical Advantage | Enterprise Benefit |
| :--- | :--- | :--- |
| **High Concurrency** | Non-blocking asynchronous event loop in Node.js. | Handles simultaneous data submissions from dozens of field engineers across remote job sites without lag. |
| **Data Governance** | Strict Mongoose schema typing and RBAC middlewares. | Ensures field engineers cannot accidentally modify budgets or delete projects owned by Executive Managers. |
| **Cross-Platform Readiness** | Standardized JSON REST responses with CORS support. | Seamlessly powers iOS, Android, Web, and Windows Desktop clients from a single unified API endpoint. |

---

## ⚡ Setup & Installation Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or higher recommended)
- [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas Cloud Cluster)

### 1. Install Dependencies
Navigate to the server directory and install required NPM packages:
```bash
cd server
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root of the `server/` directory (or copy from `.env.example`):
```env
# Server Port
PORT=4000

# MongoDB Connection String (Local or Atlas)
DATABASE_URL=mongodb://127.0.0.1:27017/invenpulse

# JWT Security Secret (Use a strong random alphanumeric string)
JWT_SECRET=super_secret_invenpulse_jwt_key_2026
```

### 3. Start the Server

#### Development Mode (with Nodemon auto-reload):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

Once started, the API server will listen for incoming client requests on `http://localhost:4000` (or the configured `PORT`).

---
*Built with ❤️ by the InvenPulse™ Engineering Team.*
