# ToolShare — Multi-Store Tool Reservation REST API

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v7.0-brightgreen.svg)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-blue.svg)](https://www.docker.com/)
[![Swagger](https://img.shields.io/badge/OpenAPI-3.0-orange.svg)](https://swagger.io/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

> A production-ready, multi-store industrial equipment reservation REST API engineered for manufacturing plants in Safi. Built with a clean layered architecture, strict Role-Based Access Control (RBAC), conflict-free reservation scheduling, ACID transactional concurrency control, automated return inspection, and containerized Docker environments.

---

## Table of Contents

- [Overview & Context](#overview--context)
- [Key Features](#key-features)
- [Architecture & Design](#architecture--design)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Running the Application](#running-the-application)
  - [Option A: Docker Compose (Recommended)](#option-a-docker-compose-recommended)
  - [Option B: Local Development](#option-b-local-development)
- [Initial Installation Process](#initial-installation-process)
- [API Documentation (Swagger UI)](#api-documentation-swagger-ui)
- [Core Endpoints Overview](#core-endpoints-overview)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Business Rules Highlights](#business-rules-highlights)
- [Concurrency & Race Condition Protection](#concurrency--race-condition-protection)
- [Running Automated Tests](#running-automated-tests)
- [Git Workflow & Commit Conventions](#git-workflow--commit-conventions)
- [Authors & Contributions](#authors--contributions)
- [License](#license)

---

## Overview & Context

An industrial manufacturing plant in Safi operates multiple specialized tool stores across its facility sites. Field technicians and maintenance teams require continuous access to drills, angle grinders, precision measurement devices, and heavy machinery.

**ToolShare** centralizes store management, equipment tracking, and loan workflows:
- Eliminates overlapping reservations on the same physical tool through a mathematical interval-overlap engine.
- Protects against simultaneous double-booking bursts using MongoDB multi-document ACID transactions and atomic locking.
- Restricts store managers strictly to their assigned facilities via store-scoped middlewares.
- Tracks real checkout (`dateReelleSortie`) and return (`dateReelleDeReteur`) timestamps.
- Flags damaged equipment and marks them `INDISPONIBLE` immediately upon return inspection.
- Monitors overdue borrowings in real-time when the expected return date has passed.
- Enforces a secure, invite-only account creation model (no public self-registration).

---

## Key Features

- **One-Time Atomic System Setup**: Secure installation endpoint (`/api/installation`) initializing the primary Admin account with bcrypt password hashing and state locking.
- **Layered Architecture (Separation of Concerns)**: Strict decoupling of Routes, Controllers, Services, Repositories, Models, and Middlewares.
- **Conflict-Free Reservation Engine**: Mathematically guarantees that two overlapping reservations (`dateDebut < newFin && dateFin > newDebut`) on the same active tool are rejected with `409 Conflict`.
- **Contiguous Slot Scheduling**: Seamlessly allows a reservation to start at the exact end second of an earlier reservation.
- **ACID Transactional Concurrency Control**: Uses MongoDB session transactions (`startSession`, `withTransaction`) to eliminate race conditions under simultaneous booking requests.
- **Store-Scoped Security**: Store Managers (`Gestionnaire`) are strictly isolated to viewing and modifying tools, accounts, and reservations within their assigned store.
- **Equipment Inventory with Unique Reference Tracking**: Global physical reference uniqueness (`reference`) across all plant materials.
- **Overdue Borrowing Detection**: Dedicated real-time monitoring of late loans (`/api/borrowings/overdue`) where `dateFin < now` and status remains `EN_COURS`.
- **Auditable Soft Deletes**: Logical deactivation (`isActive: false`) preserves historical loans and completed returns without breaking foreign-key references.
- **Return Lifecycle & Damage Inspection**: Automatically changes damaged equipment to `INDISPONIBLE` upon return.
- **Interactive OpenAPI 3.0 Documentation**: Complete interactive Swagger UI accessible directly at `/api/docs`.

---

## Architecture & Design

ToolShare strictly adheres to the **Layered Architectural Pattern**:

```
             ┌────────────────────────┐
             │     Client Request     │
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │   Routes & Middlewares │  (JWT Auth, RBAC, Store-Scope)
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │       Controllers      │  (HTTP Parsing, Status Codes, Next)
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │        Services        │  (Business Rules, Date Arithmetic, Overlap Detection)
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │  ACID Concurrency Layer│  (MongoDB Session Transactions & Atomic Locks)
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │      Repositories      │  (Mongoose Queries, MongoDB Data Access)
             └───────────┬────────────┘
                         │
                         ▼
             ┌────────────────────────┐
             │     MongoDB Cluster    │  (Persistent Storage)
             └────────────────────────┘
```

---

## Tech Stack

- **Runtime**: Node.js (v18.x or v20.x+)
- **Web Framework**: Express.js (v4.21+)
- **Database**: MongoDB (v7.0+) with Replica Set support for Transactions
- **ODM**: Mongoose (v8.9+)
- **Security & Cryptography**: JSON Web Tokens (`jsonwebtoken`), `bcryptjs`
- **Documentation**: Swagger UI Express (`swagger-ui-express`) with OpenAPI 3.0
- **Containerization**: Docker, Docker Compose
- **Testing**: Node.js native test runner (`node --test`)

---

## Project Structure

```bash
ToolShare/
├── .env.example                     # Sample environment configuration
├── compose.yaml                     # Docker Compose multi-container setup
├── Dockerfile                       # Production-grade Node.js container image
├── package.json                     # Project dependencies and test scripts
├── README.md                        # Project documentation
├── src/
│   ├── app.js                       # Express app configuration & middleware pipeline
│   ├── server.js                    # Server entry point & graceful shutdown
│   ├── config/
│   │   ├── db.js                    # Mongoose database connection
│   │   └── env.js                   # Environment variable loader
│   ├── controllers/
│   │   ├── authController.js        # Authentication endpoints
│   │   ├── installationController.js# Initial setup endpoints
│   │   ├── magasinController.js     # Store management endpoints
│   │   ├── profileController.js     # User profile endpoints
│   │   ├── reservationController.js # Reservation, return & loan endpoints
│   │   └── userController.js        # User management endpoints
│   ├── docs/
│   │   └── swagger.json             # Comprehensive OpenAPI 3.0 specification
│   ├── middlewares/
│   │   ├── authMiddleware.js        # JWT token extraction & verification
│   │   ├── errorHandler.js          # Centralized HTTP error handler
│   │   ├── roleMiddleware.js        # RBAC role access validator
│   │   └── storeScopeMiddleware.js  # Store isolation validator for managers
│   ├── models/
│   │   ├── AppConfig.js             # Installation state flag
│   │   ├── Magasin.js               # Store entity model
│   │   ├── Materiel.js              # Equipment & tool entity model
│   │   ├── Reservation.js           # Reservation & loan entity model
│   │   └── User.js                  # User account model
│   ├── repositories/
│   │   ├── magasinRepository.js     # Store data access queries
│   │   ├── materielRepository.js    # Material data access queries
│   │   ├── reservationRepository.js # Reservation data access & overlapping queries
│   │   └── userRepository.js        # User data access queries
│   ├── routes/
│   │   ├── authRoutes.js            # /api/auth routes
│   │   ├── index.js                 # Central API route aggregator
│   │   ├── installationRoutes.js    # /api/installation routes
│   │   ├── magasinRoutes.js         # /api/magasin routes
│   │   ├── profileRoutes.js         # /api/users/me routes
│   │   ├── reservationRoutes.js     # /api/reservations routes
│   │   └── userRoutes.js            # /api/users routes
│   ├── services/
│   │   ├── instalationService.js    # Installation orchestration & rollback
│   │   ├── magasinService.js        # Store business logic
│   │   ├── reservationService.js    # Overlap detection, tool checks, returns & concurrency
│   │   └── userService.js           # User account logic & privilege escalation guard
│   └── utils/
│       └── jwtConfig.js             # JWT secret resolution
└── tests/                           # Unit, integration & concurrency test suites
```

---

## Prerequisites

Before getting started, make sure you have the following installed:
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (version 18.x or 20.x+)
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)

---

## Environment Setup

Clone the repository and prepare your environment variables:

```bash
git clone https://github.com/khadijaabirat/ToolShare.git
cd ToolShare
cp .env.example .env
```

Configure your `.env` file:

```ini
PORT=3000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/toolshare
JWT_SECRET=your_super_secret_high_entropy_key_here
JWT_EXPIRES_IN=24h
```

---

## Running the Application

### Option A: Docker Compose (Recommended)

Run the backend and persistent MongoDB instance with a single command:

```bash
# Build images and start containers in detached mode
docker compose up -d --build

# View container logs
docker compose logs -f backend

# Stop containers
docker compose down
```

The API will be live at `http://localhost:3000`.

---

### Option B: Local Development

1. Ensure a local MongoDB instance is running:
   ```bash
   mongod --dbpath /data/db
   ```

2. Install dependencies and launch the hot-reload development server:
   ```bash
   npm install
   npm run dev
   ```

The application will listen on the port specified in `.env` (default: `http://localhost:3000`).

---

## Initial Installation Process

ToolShare enforces a zero-configuration default state until initialized via the installation endpoint:

1. **Check Installation Status**:
   ```bash
   curl -X GET http://localhost:3000/api/installation/status
   ```
   *Expected Response:*
   ```json
   { "isInstalled": false }
   ```

2. **Run Initial Installation**:
   ```bash
   curl -X POST http://localhost:3000/api/installation \
     -H "Content-Type: application/json" \
     -d '{
       "nom": "Abirat",
       "prenom": "Khadija",
       "email": "admin@toolshare.ma",
       "password": "Password123!"
     }'
   ```
   *Response (HTTP 201 Created):*
   ```json
   {
     "success": true,
     "message": "Application installée avec succès.",
     "data": {
       "user": {
         "id": "60d0fe4f5311236168a109ca",
         "nom": "Abirat",
         "prenom": "Khadija",
         "email": "admin@toolshare.ma",
         "role": "Admin"
       }
     }
   }
   ```

*Note: Any subsequent request to `/api/installation` will be strictly rejected with HTTP 400.*

---

## API Documentation (Swagger UI)

ToolShare embeds an interactive OpenAPI 3.0 documentation explorer.

Once the server is running, navigate to:
👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

### Testing Authenticated Routes in Swagger:
1. Call `POST /api/auth/login` with your credentials.
2. Copy the returned `token`.
3. Click the **Authorize 🔓** button at the top right of the Swagger UI.
4. Paste the token into the field and click **Authorize**.
5. All protected endpoints can now be executed directly within the browser!

---

## Core Endpoints Overview

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/installation/status` | Public | Check if system is installed |
| **POST** | `/api/installation` | Public (once) | Create initial Admin account |
| **POST** | `/api/auth/login` | Public | Authenticate user & issue JWT token |
| **GET** | `/api/users/me` | Authenticated | Retrieve authenticated user profile |
| **PUT** | `/api/users/me` | Authenticated | Update profile details and password |
| **POST** | `/api/users` | Admin, Gestionnaire | Create accounts (No privilege escalation) |
| **GET** | `/api/users` | Admin, Gestionnaire | List accounts (Scoped to store for managers)|
| **PATCH**| `/api/users/:id/deactivate` | Admin | Soft-deactivate an account (retains history) |
| **GET** | `/api/magasin` | Admin | List all stores |
| **POST** | `/api/magasin` | Admin | Create a new industrial store |
| **GET** | `/api/magasin/active` | Authenticated | List all active stores for booking |
| **GET** | `/api/magasin/:id` | Authenticated | Get store details |
| **PUT** | `/api/magasin/:id` | Admin | Update store information |
| **DELETE**| `/api/magasin/:id` | Admin | Logical deactivation (`isActive: false`) |
| **PATCH**| `/api/magasin/:id/gestionnaire`| Admin | Assign a manager exclusively to a store |
| **POST** | `/api/reservations` | Authenticated | Create a reservation (Conflict-free & Concurrency-safe) |
| **GET** | `/api/reservations/my` | Authenticated | View authenticated user's reservations |
| **GET** | `/api/reservations` | Admin, Gestionnaire | Filtered reservations (manager scoped) |
| **DELETE**| `/api/reservations/:id` | Authenticated (Owner)| Cancel reservation before start date |
| **POST** | `/api/reservations/:id/return` | Admin, Gestionnaire | Record return & flag damaged equipment |
| **GET** | `/api/borrowings/overdue` | Admin, Gestionnaire | Detect overdue borrowings in real-time |
| **GET** | `/api/borrowings/history` | Authenticated | View complete loan history and return states |

---

## Role-Based Access Control (RBAC)

| Capability | Admin | Gestionnaire | Utilisateur |
| :--- | :---: | :---: | :---: |
| Authenticate & update personal profile | ✅ | ✅ | ✅ |
| View active stores and tool availability | ✅ | ✅ | ✅ |
| Reserve tools across any active store | ✅ | ✅ | ✅ |
| View & cancel personal reservations | ✅ | ✅ | ✅ |
| Create store manager accounts | ✅ | ❌ | ❌ |
| Create regular user accounts | ✅ | ✅ *(Store-scoped)* | ❌ |
| Manage stores (CRUD, activation) | ✅ | ❌ | ❌ |
| Assign manager to a store | ✅ | ❌ | ❌ |
| Filter & view store reservations | ✅ *(All)* | ✅ *(Assigned store)* | ❌ |
| Process returns & record equipment condition | ✅ | ✅ *(Assigned store)* | ❌ |
| Monitor overdue borrowings & loan logs | ✅ *(All)* | ✅ *(Assigned store)* | ✅ *(Personal)* |

---

## Business Rules Highlights

1. **Overlap Prevention Engine**: Two active reservations (`CONFIRMEE` or `EN_COURS`) on the same physical tool cannot intersect:
   $$\text{Existing.dateDebut} < \text{New.dateFin} \quad \land \quad \text{Existing.dateFin} > \text{New.dateDebut}$$
   *Contiguous slots ($\text{New.dateDebut} == \text{Existing.dateFin}$) are strictly allowed without false positives.*
2. **Tool & Store Validation (TOOL-103)**:
   - Tool must exist (`404 Not Found`).
   - Tool must belong to the selected store (`404 Bad Request`).
   - Tool must not be in maintenance (`statut != 'INDISPONIBLE'`).
   - Tool must be active (`isActive == true`).
   - Store must be active (`isActive == true`).
3. **Safe Cancellation Protocol**: A confirmed reservation can only be cancelled before its start date (`dateDebut > now`). Once cancelled, its slot is freed immediately for other technicians.
4. **Equipment Restitution & Damage Protocol**:
   - Marking return state as `ENDOMMAGE` automatically switches the equipment status to `INDISPONIBLE`.
   - Returns remain authorized even if a store or tool has been marked inactive.
5. **Overdue Borrowing Detection**:
   - Any reservation with status `EN_COURS` whose `dateFin < now` is automatically flagged as overdue in the monitoring dashboard.
6. **Physical Reference Uniqueness**:
   - Every physical tool is guaranteed a unique reference across the entire plant database.

---

## Concurrency & Race Condition Protection

In high-demand industrial environments, multiple field technicians might attempt to reserve the same specialized tool for overlapping intervals simultaneously. 

ToolShare implements an **ACID Transactional Concurrency Layer**:
- **MongoDB Session Transactions**: Encapsulates slot availability checking and reservation persistence within an isolated transaction (`session.withTransaction()`).
- **Atomic Conflict Resolution**: If two parallel requests race for the exact same tool and overlapping window:
  - The winning request acquires the lock, completes the transaction, and receives `HTTP 201 Created`.
  - The losing request aborts safely, rolls back, and receives `HTTP 409 Conflict` with a clear explanation.
- **Stress-Tested Under Load**: Validated through parallel burst test suites simulating concurrent HTTP requests with zero double-booking occurrences.

---

## Running Automated Tests

ToolShare includes an automated test suite verifying business logic, overlap calculations, status transitions, RBAC isolation, and concurrent booking safety:

```bash
# Run the entire test suite
npm test
```

*Expected output:*
```bash
ℹ tests 95
ℹ suites 4
ℹ pass 94
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 5040.8727
```

---

## Git Workflow & Commit Conventions

The project follows a standard feature-branch workflow integrated with Jira issue tracking:

### Branching Strategy
- `main`: Production release branch.
- `dev`: Core development & sprint integration branch.
- `feature/<developer>/<feature-name>`: Scoped feature branches (e.g., `feature/khadija/Reservation`, `feature/khadija/documentation`, `feature/ayman/concurrency`).

### Commit Message Syntax
```bash
<JIRA-ISSUE-KEY> #<status> <type>(<scope>): <short description>
```

#### Commit Examples:
- `TOOL-103 #done feat(reservation): validate tool active state and store ownership`
- `TOOL-105 #done feat(concurrency): implement atomic session transactions for overlapping booking`
- `TOOL-106 #done test(concurrency): add automated parallel double-booking stress test`
- `TOOL-116 #done feat(return): implement return registration and damage handling`
- `TOOL-118 #done feat(borrowing): implement overdue borrowings detection endpoint`
- `TOOL-127 #done feat(docs): setup Swagger UI OpenAPI 3.0 at /api/docs`
- `TOOL-128 #done docs: add comprehensive professional README in English`

---

## Authors & Contributions

Developed as part of the **ToolShare Industrial Equipment Platform Project**:

- **Khadija Abirat** (`abiratkhadija@gmail.com`)  
  *Software Architecture & Core Domain Engine*
  - Designed the layered architecture, Mongoose schemas, and domain models.
  - Implemented the one-time atomic system installation lifecycle (`/api/installation`).
  - Developed full store management (`/api/magasin`) and exclusive manager assignments.
  - Engineered the conflict-free reservation scheduling engine and contiguous slot algorithms (`TOOL-103`).
  - Implemented the equipment return lifecycle, actual timestamps tracking, and automatic damage inspection (`TOOL-116`, `TOOL-117`).
  - Authored the comprehensive OpenAPI 3.0 (Swagger UI) specification and API interactive documentation (`TOOL-127`).

- **Ayman Loussal** (`aymanloussal552@gmail.com`)  
  *DevOps, Security, Concurrency & Quality Assurance*
  - Built the multi-container Docker Compose infrastructure and production Dockerfile.
  - Implemented secure JWT authentication, password hashing (`bcrypt`), and user profile management (`/api/users/me`).
  - Engineered the Role-Based Access Control (`roleMiddleware`) and store-scoping isolation filters (`storeScopeMiddleware`).
  - Developed user account management (`/api/users`) with anti-privilege escalation guards and auditable soft deactivations.
  - Implemented the ACID transactional concurrency layer with MongoDB sessions to prevent simultaneous double-booking race conditions (`TOOL-104`, `TOOL-105`).
  - Developed overdue loan tracking (`/api/borrowings/overdue`) and full movement history (`TOOL-118`, `TOOL-119`).
  - Engineered the comprehensive automated unit, integration, and parallel concurrency test suite (`TOOL-106`, `TOOL-122`, `TOOL-124`).

---

## License

This project is licensed under the **ISC License**.
