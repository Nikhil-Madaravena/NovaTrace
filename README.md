# 🔭 NovaTrace

**Distributed Infrastructure Observability Platform** — Production-grade real-time monitoring with an award-winning dark UI.

![NovaTrace](https://img.shields.io/badge/NovaTrace-v2.0.0-06b6d4?style=for-the-badge)
![Go](https://img.shields.io/badge/Go-1.21-00ADD8?style=for-the-badge&logo=go)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **JWT Auth** | bcrypt-hashed passwords, 72h token expiry, Admin & Viewer roles |
| 📡 **Real-time Streaming** | WebSocket live metrics every 2s via Redis Pub/Sub |
| 🖥️ **Multi-Node** | Monitor multiple infrastructure nodes simultaneously |
| ⚙️ **Process Monitor** | Top 15 CPU-intensive processes per node (updated every 10s) |
| 🚨 **Alert Engine** | Configurable threshold rules persisted in PostgreSQL |
| 📈 **Historical Charts** | Area charts with live + historical metric data |
| 🗃️ **Terminal Logs** | Live streaming agent output log viewer |
| ⚙️ **Settings Panel** | Project info, credentials, session management |

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose

### Run
```bash
git clone https://github.com/Nikhil-Madaravena/NovaTrace.git
cd NovaTrace
docker compose up --build
```

Open **http://localhost:5173**

---

## 🔑 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@novatrace.io` | `admin123` |
| **Viewer** | `viewer@novatrace.io` | `viewer123` |

Or register your own account on the login page.

---

## 🏗️ Architecture

```
┌─────────────┐    WebSocket    ┌──────────────┐
│   Frontend  │◄───────────────►│   Backend    │
│  React + TS │    REST API     │  Go + Gin    │
└─────────────┘                 └──────┬───────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
             ┌──────┴──────┐  ┌───────┴──────┐  ┌────────┴─────┐
             │  PostgreSQL  │  │    Redis     │  │    Agent     │
             │   GORM ORM  │  │  Pub/Sub     │  │  Go+gopsutil │
             └─────────────┘  └──────────────┘  └──────────────┘
```

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Framer Motion, Recharts, Lucide
- **Backend:** Go, Gin, GORM, golang-jwt, bcrypt, Gorilla WebSocket
- **Agent:** Go, gopsutil (CPU/MEM/DISK/Process collection)
- **Infra:** PostgreSQL 15, Redis 7, Docker Compose

## 📡 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Register user |
| POST | `/api/auth/login` | Public | Login + get JWT |
| GET | `/api/metrics` | JWT | Historical metrics |
| GET | `/api/nodes` | JWT | Registered nodes |
| GET | `/api/processes/:node` | JWT | Process list |
| GET | `/api/alerts` | JWT | Alert events |
| GET | `/api/alerts/rules` | JWT | Alert rules |
| GET | `/api/sysinfo` | Public | Platform info |
| GET | `/ws` | Public | WebSocket stream |
| POST | `/api/collect` | Agent | Ingest metrics |

## 🎨 UI Highlights

- **Glassmorphism** dark theme with animated grid background
- **5 navigation tabs:** Overview, Nodes, Processes, Alerts, Logs, Settings
- **Live metric cards** with animated progress bars
- **Real-time area charts** (CPU + Memory dual-panel)
- **Process table** with PID, name, CPU%, and memory
- **Alert feed** with severity color coding
- **Terminal-style log viewer** with auto-scroll

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `nexus-super-secret-key-change-in-prod` | JWT signing secret |
| `POSTGRES_DSN` | (local docker) | PostgreSQL connection string |
| `REDIS_ADDR` | `redis:6379` | Redis address |
| `BACKEND_URL` | `http://backend:8080` | Agent → Backend URL |
| `PORT` | `8080` | Backend listen port |

---

Made with ❤️ — NovaTrace v2.0.0
