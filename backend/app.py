"""
SmartPark — Backend Application (drtu)
======================================
Production-ready Python Flask + SQLite backend service.
Designed for Render deployment and direct integration with GitHub Pages frontend.
"""

import os
import sys
import sqlite3
import re
from datetime import datetime
from flask import Flask, request, jsonify, g, make_response

# Initialize Flask Application
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'smartpark-drtu-backend-secret-2026')

# ============================================================================
# DATABASE PATH & PERSISTENT STORAGE CONFIGURATION
# Supports configurable database path via environment variable for Render disks
# Default: drtu/database/smartpark.db
# ============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_DIR = os.path.join(BASE_DIR, 'database')
DEFAULT_DB_PATH = os.path.join(DEFAULT_DB_DIR, 'smartpark.db')

DB_PATH = os.environ.get('DATABASE_PATH') or DEFAULT_DB_PATH
DB_DIR = os.path.dirname(DB_PATH)


# ============================================================================
# CORS CONFIGURATION
# Configured for GitHub Pages: https://tayadeaishwarya542-ui.github.io
# Also allows local development origins: localhost and 127.0.0.1
# ============================================================================
ALLOWED_ORIGINS = {
    'https://tayadeaishwarya542-ui.github.io',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
}

# Optional flask-cors integration when available
try:
    from flask_cors import CORS
    CORS(app, resources={r"/*": {"origins": "*"}})
except ImportError:
    pass


@app.before_request
def handle_preflight():
    """Handle CORS preflight OPTIONS requests across all routes."""
    if request.method == "OPTIONS":
        origin = request.headers.get('Origin', '*')
        response = make_response('', 204)
        response.headers['Access-Control-Allow-Origin'] = origin if (origin in ALLOWED_ORIGINS or origin.endswith('.github.io') or origin == '*') else '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        response.headers['Access-Control-Max-Age'] = '86400'
        return response


@app.after_request
def add_cors_headers(response):
    """Ensure all responses include CORS headers for GitHub Pages."""
    origin = request.headers.get('Origin', '*')
    if origin in ALLOWED_ORIGINS or origin.endswith('.github.io') or '*' in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response


# ============================================================================
# DATABASE HELPERS & INITIALIZATION
# ============================================================================

def get_db():
    """Opens a unique SQLite connection per request context."""
    if 'db' not in g:
        if DB_DIR:
            os.makedirs(DB_DIR, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON;")
    return g.db


@app.teardown_appcontext
def close_db(error=None):
    """Closes the database connection at the end of each request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """
    Initializes database tables and seeds the 12 default parking bays.
    Ensures safe schema migration for Vehicle Entry and Exit status.
    """
    if DB_DIR:
        os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. Parking Slots Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot_number TEXT UNIQUE NOT NULL,
            vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('Two-Wheeler', 'Four-Wheeler')),
            status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'occupied')),
            current_booking_id TEXT DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
    """)

    # 2. Bookings Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id TEXT UNIQUE NOT NULL,
            customer_name TEXT NOT NULL,
            vehicle_number TEXT NOT NULL,
            vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('Two-Wheeler', 'Four-Wheeler')),
            slot_id INTEGER NOT NULL REFERENCES slots(id),
            slot_number TEXT NOT NULL,
            booking_time TEXT NOT NULL,
            release_time TEXT DEFAULT NULL,
            entry_time TEXT DEFAULT NULL,
            exit_time TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'Parked' CHECK(status IN ('Parked', 'Exited', 'Cancelled', 'active', 'completed', 'parked', 'exited'))
        );
    """)

    # Indices for performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings(vehicle_number, status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id, status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_bookings_id ON bookings(booking_id);")

    # Seed 12 sample parking slots if empty
    cursor.execute("SELECT COUNT(*) AS count FROM slots;")
    count = cursor.fetchone()['count']

    if count == 0:
        two_wheeler_slots = [(f"A-0{i}", "Two-Wheeler", "available") for i in range(1, 7)]
        four_wheeler_slots = [(f"B-0{i}", "Four-Wheeler", "available") for i in range(1, 7)]
        all_slots = two_wheeler_slots + four_wheeler_slots

        cursor.executemany("""
            INSERT INTO slots (slot_number, vehicle_type, status)
            VALUES (?, ?, ?);
        """, all_slots)
        conn.commit()

    conn.commit()
    conn.close()


# Auto-initialize database on startup
init_db()


def generate_booking_id():
    """Generates sequential, user-friendly booking ID (e.g., BK-1001, BK-1002)."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT MAX(id) AS max_id FROM bookings;")
    row = cursor.fetchone()
    next_num = 1001 if (row is None or row['max_id'] is None) else (row['max_id'] + 1001)
    return f"BK-{next_num}"


# ============================================================================
# ROOT & HEALTH CHECK ENDPOINTS (FOR RENDER DEPLOYMENT)
# ============================================================================

@app.route('/', methods=['GET'])
def index():
    """Root endpoint returning API service metadata and status."""
    return jsonify({
        'service': 'SmartPark Backend API',
        'version': '2.0.0',
        'status': 'healthy',
        'database': 'SQLite',
        'endpoints': {
            'health': '/health',
            'dashboard': '/api/dashboard',
            'slots': '/api/slots',
            'bookings': '/api/bookings',
            'exit_booking': '/api/bookings/<booking_id>/exit'
        },
        'cors_allowed_frontend': 'https://tayadeaishwarya542-ui.github.io'
    }), 200


@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint used by Render to verify service availability."""
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT COUNT(*) AS total_slots FROM slots;")
        slots_count = cursor.fetchone()['total_slots']
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'total_slots': slots_count,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }), 500


# ============================================================================
# DASHBOARD API ENDPOINT
# ============================================================================

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_stats():
    """
    Returns live statistics for the parking dashboard:
    - Total slots, available slots, occupied slots
    - Currently parked vehicles, total vehicles exited today, total exited overall
    - Slot breakdowns by Two-Wheeler and Four-Wheeler
    - Recent parked vehicles preview
    """
    db = get_db()
    cursor = db.cursor()

    # Slot counts
    cursor.execute("""
        SELECT 
            COUNT(*) AS total_slots,
            SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_slots,
            SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied_slots
        FROM slots;
    """)
    slot_stats = dict(cursor.fetchone())

    # Booking counts and vehicle entry/exit status counts
    cursor.execute("""
        SELECT 
            SUM(CASE WHEN status IN ('Parked', 'active', 'parked') THEN 1 ELSE 0 END) AS parked_vehicles,
            SUM(CASE WHEN status IN ('Exited', 'completed', 'exited') THEN 1 ELSE 0 END) AS total_exited,
            SUM(CASE 
                WHEN status IN ('Exited', 'completed', 'exited') 
                     AND (date(COALESCE(exit_time, release_time)) = date('now', 'localtime')) 
                THEN 1 ELSE 0 
            END) AS exited_today,
            SUM(CASE WHEN status IN ('Cancelled', 'cancelled') THEN 1 ELSE 0 END) AS cancelled_bookings,
            COUNT(*) AS total_bookings
        FROM bookings;
    """)
    booking_counts = dict(cursor.fetchone())

    # Breakdown by vehicle type
    cursor.execute("""
        SELECT 
            vehicle_type,
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied
        FROM slots
        GROUP BY vehicle_type;
    """)
    breakdown_rows = cursor.fetchall()
    breakdown = {
        'Two-Wheeler': {'total': 0, 'available': 0, 'occupied': 0},
        'Four-Wheeler': {'total': 0, 'available': 0, 'occupied': 0}
    }
    for row in breakdown_rows:
        v_type = row['vehicle_type']
        if v_type in breakdown:
            breakdown[v_type] = {
                'total': row['total'] or 0,
                'available': row['available'] or 0,
                'occupied': row['occupied'] or 0
            }

    # Fetch up to 5 most recent parked vehicles
    cursor.execute("""
        SELECT 
            booking_id, customer_name, vehicle_number, vehicle_type, slot_number,
            COALESCE(entry_time, booking_time) AS entry_time,
            COALESCE(entry_time, booking_time) AS booking_time,
            status
        FROM bookings
        WHERE status IN ('Parked', 'active', 'parked')
        ORDER BY id DESC
        LIMIT 5;
    """)
    recent_bookings = []
    for r in cursor.fetchall():
        item = dict(r)
        item['status'] = 'Parked'
        recent_bookings.append(item)

    parked_count = booking_counts['parked_vehicles'] or 0
    exited_today_count = booking_counts['exited_today'] or 0
    total_exited_count = booking_counts['total_exited'] or 0

    return jsonify({
        'success': True,
        'data': {
            'total_slots': slot_stats['total_slots'] or 0,
            'available_slots': slot_stats['available_slots'] or 0,
            'occupied_slots': slot_stats['occupied_slots'] or 0,
            'parked_vehicles': parked_count,
            'active_bookings': parked_count,
            'exited_today': exited_today_count,
            'total_exited': total_exited_count,
            'completed_bookings': total_exited_count,
            'breakdown': breakdown,
            'recent_bookings': recent_bookings
        }
    }), 200


# ============================================================================
# PARKING SLOTS API ENDPOINTS
# ============================================================================

@app.route('/api/slots', methods=['GET'])
def get_slots():
    """Returns list of all parking bays with live occupancy and vehicle details."""
    db = get_db()
    cursor = db.cursor()

    status_filter = request.args.get('status', 'all').strip().lower()
    type_filter = request.args.get('vehicle_type', 'all').strip()

    query = """
        SELECT 
            s.id, 
            s.slot_number, 
            s.vehicle_type, 
            s.status,
            s.current_booking_id,
            b.customer_name,
            b.vehicle_number,
            COALESCE(b.entry_time, b.booking_time) AS booking_time,
            b.status AS booking_status
        FROM slots s
        LEFT JOIN bookings b ON s.current_booking_id = b.booking_id AND b.status IN ('Parked', 'active', 'parked')
        WHERE 1=1
    """
    params = []

    if status_filter in ['available', 'occupied']:
        query += " AND s.status = ?"
        params.append(status_filter)

    if type_filter in ['Two-Wheeler', 'Four-Wheeler']:
        query += " AND s.vehicle_type = ?"
        params.append(type_filter)

    query += " ORDER BY s.slot_number ASC;"

    cursor.execute(query, params)
    slots = []
    for row in cursor.fetchall():
        slots.append({
            'id': row['id'],
            'slot_number': row['slot_number'],
            'vehicle_type': row['vehicle_type'],
            'status': row['status'],
            'current_booking': {
                'booking_id': row['current_booking_id'],
                'customer_name': row['customer_name'],
                'vehicle_number': row['vehicle_number'],
                'booking_time': row['booking_time'],
                'entry_time': row['booking_time'],
                'status': 'Parked'
            } if row['status'] == 'occupied' and row['current_booking_id'] else None
        })

    return jsonify({
        'success': True,
        'count': len(slots),
        'slots': slots
    }), 200


@app.route('/api/slots/<int:slot_id>', methods=['GET'])
def get_slot_detail(slot_id):
    """Returns details of a specific parking bay."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT 
            s.id, s.slot_number, s.vehicle_type, s.status, s.current_booking_id,
            b.customer_name, b.vehicle_number, COALESCE(b.entry_time, b.booking_time) AS booking_time,
            b.status AS booking_status
        FROM slots s
        LEFT JOIN bookings b ON s.current_booking_id = b.booking_id AND b.status IN ('Parked', 'active', 'parked')
        WHERE s.id = ?;
    """, (slot_id,))
    row = cursor.fetchone()

    if not row:
        return jsonify({'success': False, 'error': f"Slot with ID {slot_id} not found."}), 404

    slot_data = {
        'id': row['id'],
        'slot_number': row['slot_number'],
        'vehicle_type': row['vehicle_type'],
        'status': row['status'],
        'current_booking': {
            'booking_id': row['current_booking_id'],
            'customer_name': row['customer_name'],
            'vehicle_number': row['vehicle_number'],
            'booking_time': row['booking_time'],
            'entry_time': row['booking_time'],
            'status': 'Parked'
        } if row['status'] == 'occupied' and row['current_booking_id'] else None
    }

    return jsonify({'success': True, 'slot': slot_data}), 200


# ============================================================================
# VEHICLE ENTRY & BOOKING API ENDPOINT
# ============================================================================

@app.route('/api/bookings', methods=['POST'])
def create_booking():
    """
    Creates a new vehicle entry booking.
    - Validates customer name, vehicle number, vehicle type, and slot ID
    - Prevents duplicate active booking for the same vehicle
    - Verifies slot existence and availability
    - Sets vehicle status to 'Parked' and slot to 'occupied'
    - Executes atomically within SQLite transaction
    """
    data = request.get_json(silent=True) or {}

    customer_name = (data.get('customer_name') or '').strip()
    vehicle_number = (data.get('vehicle_number') or '').strip().upper()
    vehicle_type = (data.get('vehicle_type') or '').strip()
    slot_id = data.get('slot_id')

    errors = []

    if not customer_name:
        errors.append("Customer name is required.")
    elif len(customer_name) < 2 or len(customer_name) > 60:
        errors.append("Customer name must be between 2 and 60 characters.")

    if not vehicle_number:
        errors.append("Vehicle registration number is required.")
    elif len(vehicle_number) < 3 or len(vehicle_number) > 20:
        errors.append("Vehicle number must be between 3 and 20 characters.")
    elif not re.match(r'^[A-Z0-9\s\-]+$', vehicle_number):
        errors.append("Vehicle number contains invalid characters (letters, numbers, hyphens only).")

    if vehicle_type not in ['Two-Wheeler', 'Four-Wheeler']:
        errors.append("Vehicle type must be either 'Two-Wheeler' or 'Four-Wheeler'.")

    try:
        slot_id = int(slot_id)
    except (TypeError, ValueError):
        errors.append("A valid parking slot must be selected.")

    if errors:
        return jsonify({'success': False, 'error': " ".join(errors), 'details': errors}), 400

    db = get_db()
    cursor = db.cursor()

    try:
        # Check for duplicate active parked booking
        cursor.execute("""
            SELECT booking_id, slot_number, COALESCE(entry_time, booking_time) AS entry_time
            FROM bookings 
            WHERE UPPER(vehicle_number) = ? AND status IN ('Parked', 'active', 'parked');
        """, (vehicle_number,))
        existing_vehicle = cursor.fetchone()
        if existing_vehicle:
            return jsonify({
                'success': False,
                'error': f"Vehicle '{vehicle_number}' is already parked in Slot {existing_vehicle['slot_number']} (Booking {existing_vehicle['booking_id']}). Duplicate entry is not allowed."
            }), 409

        # Check slot existence and availability
        cursor.execute("SELECT id, slot_number, vehicle_type, status FROM slots WHERE id = ?;", (slot_id,))
        slot = cursor.fetchone()

        if not slot:
            return jsonify({'success': False, 'error': f"Parking slot ID {slot_id} does not exist."}), 404

        if slot['status'] != 'available':
            return jsonify({
                'success': False,
                'error': f"Slot {slot['slot_number']} is currently occupied. Please choose an available slot."
            }), 409

        if slot['vehicle_type'] != vehicle_type:
            return jsonify({
                'success': False,
                'error': f"Slot {slot['slot_number']} is reserved for {slot['vehicle_type']}, but vehicle is a {vehicle_type}."
            }), 400

        # Generate unique booking ID and timestamp
        booking_id = generate_booking_id()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Atomic transaction
        cursor.execute("""
            INSERT INTO bookings (
                booking_id, customer_name, vehicle_number, vehicle_type, 
                slot_id, slot_number, booking_time, entry_time, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Parked');
        """, (booking_id, customer_name, vehicle_number, vehicle_type, slot_id, slot['slot_number'], now_str, now_str))

        cursor.execute("""
            UPDATE slots 
            SET status = 'occupied', current_booking_id = ? 
            WHERE id = ? AND status = 'available';
        """, (booking_id, slot_id))

        if cursor.rowcount == 0:
            db.rollback()
            return jsonify({
                'success': False,
                'error': f"Slot {slot['slot_number']} was just occupied by another request. Please try again."
            }), 409

        db.commit()

        return jsonify({
            'success': True,
            'message': f"Slot {slot['slot_number']} booked successfully! Vehicle {vehicle_number} is now marked as Parked.",
            'booking': {
                'booking_id': booking_id,
                'customer_name': customer_name,
                'vehicle_number': vehicle_number,
                'vehicle_type': vehicle_type,
                'slot_id': slot_id,
                'slot_number': slot['slot_number'],
                'entry_time': now_str,
                'booking_time': now_str,
                'status': 'Parked'
            }
        }), 201

    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': f"Database transaction failed: {str(e)}"}), 500


# ============================================================================
# VEHICLE EXIT & CHECKOUT API ENDPOINT
# ============================================================================

@app.route('/api/bookings/<string:booking_id>/exit', methods=['POST'])
@app.route('/api/bookings/<string:booking_id>/release', methods=['POST'])
def exit_booking_by_id(booking_id):
    """
    Vehicle Exit / Checkout endpoint.
    - Changes vehicle status to 'Exited'
    - Records exit_time and release_time
    - Sets parking slot back to 'available'
    - Prevents double checkout
    """
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute("""
            SELECT id, slot_id, slot_number, status, vehicle_number, customer_name,
                   COALESCE(entry_time, booking_time) AS entry_time
            FROM bookings 
            WHERE booking_id = ?;
        """, (booking_id,))
        booking = cursor.fetchone()

        if not booking:
            return jsonify({'success': False, 'error': f"Booking '{booking_id}' not found."}), 404

        if booking['status'] in ('Exited', 'completed', 'exited'):
            return jsonify({
                'success': False, 
                'error': f"Vehicle '{booking['vehicle_number']}' (Booking {booking_id}) has already exited / checked out."
            }), 400

        if booking['status'] in ('Cancelled', 'cancelled'):
            return jsonify({
                'success': False,
                'error': f"Booking '{booking_id}' is cancelled and cannot be exited."
            }), 400

        exit_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Atomic update
        cursor.execute("""
            UPDATE bookings
            SET status = 'Exited', exit_time = ?, release_time = ?
            WHERE booking_id = ? AND status IN ('Parked', 'active', 'parked');
        """, (exit_time, exit_time, booking_id))

        if cursor.rowcount == 0:
            db.rollback()
            return jsonify({
                'success': False,
                'error': f"Vehicle '{booking['vehicle_number']}' has already exited or is no longer parked."
            }), 400

        cursor.execute("""
            UPDATE slots
            SET status = 'available', current_booking_id = NULL
            WHERE id = ?;
        """, (booking['slot_id'],))

        db.commit()

        return jsonify({
            'success': True,
            'message': f"Vehicle {booking['vehicle_number']} (Slot {booking['slot_number']}) has successfully exited and logged out.",
            'booking': {
                'booking_id': booking_id,
                'customer_name': booking['customer_name'],
                'vehicle_number': booking['vehicle_number'],
                'slot_number': booking['slot_number'],
                'entry_time': booking['entry_time'],
                'exit_time': exit_time,
                'status': 'Exited'
            }
        }), 200

    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': f"Failed to checkout vehicle: {str(e)}"}), 500


@app.route('/api/slots/<int:slot_id>/exit', methods=['POST'])
@app.route('/api/slots/<int:slot_id>/release', methods=['POST'])
def release_slot(slot_id):
    """Releases an occupied parking bay and marks its parked vehicle as 'Exited'."""
    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute("SELECT id, slot_number, status, current_booking_id FROM slots WHERE id = ?;", (slot_id,))
        slot = cursor.fetchone()

        if not slot:
            return jsonify({'success': False, 'error': f"Slot ID {slot_id} not found."}), 404

        if slot['status'] != 'occupied':
            return jsonify({'success': False, 'error': f"Slot {slot['slot_number']} is already available."}), 400

        exit_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        booking_id = slot['current_booking_id']

        cursor.execute("""
            UPDATE bookings
            SET status = 'Exited', exit_time = ?, release_time = ?
            WHERE slot_id = ? AND status IN ('Parked', 'active', 'parked');
        """, (exit_time, exit_time, slot_id))

        cursor.execute("""
            UPDATE slots
            SET status = 'available', current_booking_id = NULL
            WHERE id = ?;
        """, (slot_id,))

        db.commit()

        return jsonify({
            'success': True,
            'message': f"Slot {slot['slot_number']} has been successfully released and vehicle marked as Exited.",
            'released_slot': slot['slot_number'],
            'booking_id': booking_id,
            'exit_time': exit_time,
            'status': 'Exited'
        }), 200

    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': f"Failed to release slot: {str(e)}"}), 500


# ============================================================================
# BOOKING HISTORY & SEARCH API ENDPOINT
# ============================================================================

@app.route('/api/bookings', methods=['GET'])
def get_bookings():
    """
    Returns booking history with optional filtering and search.
    Query parameters:
    - ?status=all|parked|exited|cancelled
    - ?search=<keyword> (searches vehicle_number, customer_name, booking_id)
    - ?limit=100
    """
    db = get_db()
    cursor = db.cursor()

    status_filter = request.args.get('status', 'all').strip().lower()
    search_query = request.args.get('search', '').strip()

    try:
        limit = min(int(request.args.get('limit', 100)), 500)
    except ValueError:
        limit = 100

    query = """
        SELECT 
            id, booking_id, customer_name, vehicle_number, vehicle_type,
            slot_id, slot_number, 
            COALESCE(entry_time, booking_time) AS entry_time,
            booking_time, 
            COALESCE(exit_time, release_time) AS exit_time,
            release_time, 
            status
        FROM bookings
        WHERE 1=1
    """
    params = []

    if status_filter in ['parked', 'active']:
        query += " AND status IN ('Parked', 'active', 'parked')"
    elif status_filter in ['exited', 'completed']:
        query += " AND status IN ('Exited', 'completed', 'exited')"
    elif status_filter in ['cancelled']:
        query += " AND status IN ('Cancelled', 'cancelled')"

    if search_query:
        query += " AND (UPPER(vehicle_number) LIKE ? OR UPPER(customer_name) LIKE ? OR UPPER(booking_id) LIKE ?)"
        term = f"%{search_query.upper()}%"
        params.extend([term, term, term])

    query += " ORDER BY id DESC LIMIT ?;"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    bookings = []
    for row in rows:
        b = dict(row)
        raw_status = b.get('status') or 'Parked'
        if raw_status in ('active', 'Parked', 'parked'):
            b['status'] = 'Parked'
        elif raw_status in ('completed', 'Exited', 'exited'):
            b['status'] = 'Exited'
        elif raw_status in ('cancelled', 'Cancelled'):
            b['status'] = 'Cancelled'
        bookings.append(b)

    return jsonify({
        'success': True,
        'count': len(bookings),
        'bookings': bookings
    }), 200


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'success': False, 'error': 'API endpoint not found'}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'success': False, 'error': 'Method not allowed on this endpoint'}), 405


@app.errorhandler(500)
def server_error(e):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


# ============================================================================
# APPLICATION RUNNER (FOR LOCAL OR DIRECT EXECUTION)
# ============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')

    print("\n" + "=" * 60)
    print("  SmartPark -- Flask Backend Service (drtu)")
    print("=" * 60)
    print(f"  * Host Binding   : http://{host}:{port}")
    print(f"  * Health Check   : http://127.0.0.1:{port}/health")
    print(f"  * Database Path  : {DB_PATH}")
    print(f"  * CORS Target    : https://tayadeaishwarya542-ui.github.io")
    print("=" * 60 + "\n")

    app.run(host=host, port=port, debug=False)

