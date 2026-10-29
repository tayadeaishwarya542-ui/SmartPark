"""
SmartPark — Backend Test Suite (drtu)
=====================================
Automated tests validating API endpoints, database transactions,
CORS headers, health checks, and business rules.
"""

import os
import sys

# Ensure drtu directory is at the front of sys.path so drtu/app.py is imported
DRTU_DIR = os.path.dirname(os.path.abspath(__file__))
if DRTU_DIR not in sys.path:
    sys.path.insert(0, DRTU_DIR)

import unittest
import json
import tempfile
import app as app_module
from app import app

class SmartParkDrtuTestCase(unittest.TestCase):
    def setUp(self):
        """Set up an isolated temporary SQLite database before each test."""
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix='.db')
        app.config['TESTING'] = True

        self.original_db_path = app_module.DB_PATH
        app_module.DB_PATH = self.temp_db_path
        app_module.DB_DIR = os.path.dirname(self.temp_db_path)

        with app.app_context():
            app_module.init_db()

        self.client = app.test_client()

    def tearDown(self):
        """Clean up the isolated database after each test."""
        os.close(self.temp_db_fd)
        try:
            os.remove(self.temp_db_path)
        except OSError:
            pass
        app_module.DB_PATH = self.original_db_path

    def test_01_health_check_endpoint(self):
        """Verify GET /health returns 200 OK with database connection status."""
        res = self.client.get('/health')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data['status'], 'healthy')
        self.assertEqual(data['database'], 'connected')
        self.assertEqual(data['total_slots'], 12)

    def test_02_database_seeded_with_12_slots(self):
        """Verify 12 slots are seeded (6 Two-Wheeler, 6 Four-Wheeler)."""
        res = self.client.get('/api/slots')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['count'], 12)

        tw = [s for s in data['slots'] if s['vehicle_type'] == 'Two-Wheeler']
        fw = [s for s in data['slots'] if s['vehicle_type'] == 'Four-Wheeler']
        self.assertEqual(len(tw), 6)
        self.assertEqual(len(fw), 6)

    def test_03_dashboard_initial_stats(self):
        """Verify initial dashboard counts."""
        res = self.client.get('/api/dashboard')
        self.assertEqual(res.status_code, 200)
        stats = res.get_json()['data']
        self.assertEqual(stats['total_slots'], 12)
        self.assertEqual(stats['available_slots'], 12)
        self.assertEqual(stats['occupied_slots'], 0)
        self.assertEqual(stats['parked_vehicles'], 0)
        self.assertEqual(stats['exited_today'], 0)

    def test_04_vehicle_entry_booking(self):
        """Verify vehicle entry marks status as Parked and slot as occupied."""
        payload = {
            "customer_name": "Aishwarya Tayade",
            "vehicle_number": "MH-12-AT-9999",
            "vehicle_type": "Two-Wheeler",
            "slot_id": 1
        }
        res = self.client.post('/api/bookings', json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['booking']['status'], 'Parked')
        self.assertIsNotNone(data['booking']['entry_time'])

        # Verify slot is occupied
        slot_res = self.client.get('/api/slots/1').get_json()['slot']
        self.assertEqual(slot_res['status'], 'occupied')
        self.assertEqual(slot_res['current_booking']['customer_name'], 'Aishwarya Tayade')

    def test_05_prevent_duplicate_active_entry(self):
        """Verify vehicle cannot enter twice while parked."""
        payload = {
            "customer_name": "Driver One",
            "vehicle_number": "MH-14-DD-1010",
            "vehicle_type": "Four-Wheeler",
            "slot_id": 7
        }
        self.client.post('/api/bookings', json=payload)

        # Attempt to book another slot
        payload2 = {
            "customer_name": "Driver One",
            "vehicle_number": "MH-14-DD-1010",
            "vehicle_type": "Four-Wheeler",
            "slot_id": 8
        }
        res2 = self.client.post('/api/bookings', json=payload2)
        self.assertEqual(res2.status_code, 409)
        self.assertIn('already parked', res2.get_json()['error'])

    def test_06_vehicle_exit_checkout(self):
        """Verify vehicle exit marks status as Exited and frees slot."""
        res_book = self.client.post('/api/bookings', json={
            "customer_name": "Rahul Verma",
            "vehicle_number": "MH-12-RV-5050",
            "vehicle_type": "Two-Wheeler",
            "slot_id": 2
        })
        booking_id = res_book.get_json()['booking']['booking_id']

        # Checkout
        res_exit = self.client.post(f'/api/bookings/{booking_id}/exit')
        self.assertEqual(res_exit.status_code, 200)
        exit_data = res_exit.get_json()
        self.assertTrue(exit_data['success'])
        self.assertEqual(exit_data['booking']['status'], 'Exited')
        self.assertIsNotNone(exit_data['booking']['exit_time'])

        # Verify slot is available
        slot = self.client.get('/api/slots/2').get_json()['slot']
        self.assertEqual(slot['status'], 'available')
        self.assertIsNone(slot['current_booking'])

    def test_07_prevent_double_checkout(self):
        """Verify that checking out an already exited vehicle returns HTTP 400."""
        res_book = self.client.post('/api/bookings', json={
            "customer_name": "Kiran More",
            "vehicle_number": "MH-12-KM-3030",
            "vehicle_type": "Two-Wheeler",
            "slot_id": 3
        })
        booking_id = res_book.get_json()['booking']['booking_id']
        self.client.post(f'/api/bookings/{booking_id}/exit')

        # Second checkout attempt
        res_second = self.client.post(f'/api/bookings/{booking_id}/exit')
        self.assertEqual(res_second.status_code, 400)
        self.assertIn('already exited', res_second.get_json()['error'])

    def test_08_cors_headers(self):
        """Verify CORS headers for GitHub Pages origin."""
        github_pages_origin = 'https://tayadeaishwarya542-ui.github.io'

        # Test preflight OPTIONS
        res_options = self.client.open(
            '/api/bookings',
            method='OPTIONS',
            headers={'Origin': github_pages_origin, 'Access-Control-Request-Method': 'POST'}
        )
        self.assertEqual(res_options.status_code, 204)
        self.assertEqual(res_options.headers.get('Access-Control-Allow-Origin'), github_pages_origin)
        self.assertIn('POST', res_options.headers.get('Access-Control-Allow-Methods', ''))

        # Test actual GET request
        res_get = self.client.get('/api/dashboard', headers={'Origin': github_pages_origin})
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.headers.get('Access-Control-Allow-Origin'), github_pages_origin)

    def test_09_booking_history_and_filters(self):
        """Verify history filters for parked and exited vehicles."""
        # 1 parked, 1 exited
        r1 = self.client.post('/api/bookings', json={
            "customer_name": "Parked Driver",
            "vehicle_number": "MH-12-P1-1000",
            "vehicle_type": "Two-Wheeler",
            "slot_id": 4
        })
        r2 = self.client.post('/api/bookings', json={
            "customer_name": "Exited Driver",
            "vehicle_number": "MH-12-E2-2000",
            "vehicle_type": "Two-Wheeler",
            "slot_id": 5
        })
        b2_id = r2.get_json()['booking']['booking_id']
        self.client.post(f'/api/bookings/{b2_id}/exit')

        # Filter: parked
        p_res = self.client.get('/api/bookings?status=parked').get_json()
        self.assertEqual(p_res['count'], 1)
        self.assertEqual(p_res['bookings'][0]['status'], 'Parked')

        # Filter: exited
        e_res = self.client.get('/api/bookings?status=exited').get_json()
        self.assertEqual(e_res['count'], 1)
        self.assertEqual(e_res['bookings'][0]['status'], 'Exited')

        # Search query
        s_res = self.client.get('/api/bookings?search=P1-1000').get_json()
        self.assertEqual(s_res['count'], 1)
        self.assertEqual(s_res['bookings'][0]['vehicle_number'], 'MH-12-P1-1000')


if __name__ == '__main__':
    unittest.main()
