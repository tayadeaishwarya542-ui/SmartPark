# SmartPark Backend API (`drtu`)

Production-ready Python Flask and SQLite backend for the **SmartPark — Smart Parking Slot Management System**.

This service manages parking bay allocations, live occupancy counts, vehicle entry tracking, exit/checkout workflows, duration calculations, and booking history. It is configured with Cross-Origin Resource Sharing (CORS) for direct integration with the GitHub Pages frontend and optimized for one-click deployment on **Render**.

---

## 1. Project Structure

All backend files are self-contained in the `drtu` folder:

```text
drtu/
├── app.py                # Main Flask REST API application & database logic
├── requirements.txt      # Production dependencies (Flask, flask-cors, gunicorn)
├── .gitignore            # Excludes bytecode, venvs, *.db databases, and .env
├── README.md             # Architecture, API endpoints, and Render guide
├── test_app.py           # Automated unit test suite (9 test cases)
└── database/             # Local SQLite database storage directory (git-ignored)
    └── smartpark.db      # Auto-created on first application startup
```

---

## 2. Technology Stack

* **Language**: Python 3.10+
* **Framework**: Flask 3.x
* **WSGI Server**: Gunicorn 21.x (for Linux / Render production)
* **Database**: SQLite 3 (lightweight, zero-config relational database)
* **CORS**: `flask-cors` with custom fallback middleware for GitHub Pages origin

---

## 3. Render Deployment Settings

When deploying this backend service to [Render.com](https://render.com/):

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Service Type** | Web Service | Python Web Service |
| **Root Directory** | `drtu` | If deploying from root repo, specify `drtu` |
| **Environment** | Python 3 | Managed Python runtime |
| **Build Command** | `pip install -r requirements.txt` | Installs Flask, CORS, and Gunicorn |
| **Start Command** | `gunicorn app:app` | Binds to `$PORT` via Render environment |
| **Health Check Path** | `/health` | Verified 200 OK endpoint |

### Environment Variables on Render (Optional)

* `PORT`: Automatically injected by Render (defaults to `5000` locally).
* `DATABASE_PATH`: Custom path to SQLite database. Default is `drtu/database/smartpark.db`. If using a Render Persistent Disk mounted at `/var/data`, set `DATABASE_PATH=/var/data/smartpark.db`.
* `SECRET_KEY`: Custom Flask session / signature key.

---

## 4. API Endpoints Reference

### A. Health & System
* **`GET /`**
  * Returns backend status, version, and route metadata.
* **`GET /health`** (or `GET /api/health`)
  * Health check for Render probes. Returns `{ "status": "healthy", "database": "connected", "total_slots": 12 }`.

### B. Dashboard Statistics
* **`GET /api/dashboard`**
  * Returns live system metrics:
    * `total_slots`: Total parking bays (12)
    * `available_slots`: Currently free bays
    * `occupied_slots`: Currently occupied bays
    * `parked_vehicles`: Vehicles currently active inside
    * `exited_today`: Total vehicles checked out today
    * `total_exited_overall`: Historical exits count
    * `two_wheeler`: Available and occupied breakdown
    * `four_wheeler`: Available and occupied breakdown
    * `recent_parked`: Top 5 currently parked vehicles

### C. Parking Slots
* **`GET /api/slots`**
  * Lists all slots.
  * Query parameters (optional): `?vehicle_type=Two-Wheeler` or `?vehicle_type=Four-Wheeler`, `?status=available` or `?status=occupied`.
* **`GET /api/slots/<id>`**
  * Returns details of a specific bay, including current parked vehicle details if occupied.
* **`POST /api/slots/<id>/exit`**
  * Shortcut exit: releases the vehicle parked in slot `<id>`.

### D. Vehicle Booking & Entry
* **`POST /api/bookings`**
  * Registers vehicle entry.
  * Marks slot as `occupied` and vehicle booking status as `Parked`.
  * Generates a sequential `booking_id` (`BK-1001`, `BK-1002`, ...).
  * Records `entry_time` timestamp.
  * **Payload (JSON)**:
    ```json
    {
      "customer_name": "Aishwarya Tayade",
      "vehicle_number": "MH-12-AT-9999",
      "vehicle_type": "Two-Wheeler",
      "slot_id": 1
    }
    ```
  * **Validation Rules**:
    * All fields required.
    * `vehicle_type` must match the slot's designated type.
    * Slot must currently be `available`.
    * Vehicle cannot enter if it already has an active `Parked` booking.

### E. Vehicle Exit / Logout
* **`POST /api/bookings/<booking_id>/exit`**
  * Completes vehicle checkout.
  * Changes booking status to `Exited`.
  * Records `exit_time` and `release_time`.
  * Calculates parked duration (e.g., `45 minutes`, `2 hours 15 minutes`).
  * Immediately frees the associated parking slot (status becomes `available`).
  * **Response (JSON)**:
    ```json
    {
      "success": true,
      "message": "Vehicle MH-12-AT-9999 has exited successfully. Slot A-01 is now available.",
      "booking": {
        "booking_id": "BK-1001",
        "vehicle_number": "MH-12-AT-9999",
        "status": "Exited",
        "duration_minutes": 45,
        "duration_formatted": "45 mins",
        "exit_time": "2026-10-29 03:00:00"
      }
    }
    ```

### F. Booking History & Search
* **`GET /api/bookings`**
  * Lists vehicle bookings ordered newest first.
  * Query parameters:
    * `?status=parked`: Only currently parked vehicles
    * `?status=exited`: Only exited/logged out vehicles
    * `?status=cancelled`: Cancelled bookings
    * `?search=<text>`: Filter by customer name, vehicle number, or booking ID

---

## 5. CORS Configuration

The backend allows requests from the user's GitHub Pages frontend:
* **Allowed Origin**: `https://tayadeaishwarya542-ui.github.io`
* **Local Development Origins**: `http://localhost:5000`, `http://127.0.0.1:5000`, `http://localhost:5500`, `http://127.0.0.1:5500`
* **Allowed Methods**: `GET, POST, PUT, DELETE, OPTIONS`
* **Allowed Headers**: `Content-Type, Authorization, X-Requested-With`
* **Preflight**: HTTP `OPTIONS` requests return `204 No Content` with appropriate headers.

---

## 6. Local Testing & Verification

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run automated unit tests**:
   ```bash
   python -m unittest test_app.py
   ```
   All 9 tests validate:
   * Health check endpoint
   * 12 slots initialization (6 Two-Wheeler, 6 Four-Wheeler)
   * Initial dashboard metrics
   * Vehicle entry & bay occupation
   * Prevention of duplicate entry for same vehicle
   * Vehicle exit/logout & bay release
   * Prevention of double checkout
   * CORS headers & preflight response
   * Booking history status filters and search

3. **Run local server**:
   ```bash
   python app.py
   ```
   Server starts at `http://127.0.0.1:5000`.

