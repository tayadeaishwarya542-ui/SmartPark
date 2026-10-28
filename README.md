# SmartPark — GitHub Pages Deployment

This folder contains the complete, self-contained static website for **SmartPark — Smart Parking Slot Management System**.

## Features Included
* **Interactive Dashboard**: Real-time KPI statistics for Total Slots, Available Slots, Occupied Slots, Currently Parked Vehicles, and Total Vehicles Exited Today.
* **12 Sample Parking Bays**: 6 Two-Wheeler bays (`A-01` to `A-06`) and 6 Four-Wheeler bays (`B-01` to `B-06`).
* **Vehicle Entry & Booking**: Interactive booking form with input validation, vehicle type matching, and duplicate prevention.
* **Vehicle Exit & Logout**: Interactive checkout modal with instant bay release back to `Available` and duplicate checkout prevention.
* **Live Booking History**: Complete session archives with search and status filtering (`All Vehicles`, `Currently Parked`, `Exited Vehicles`).
* **Client-Side Persistent Storage**: Uses modern browser `localStorage` to persist vehicle sessions across page reloads without requiring an external server.
* **Dual Operation**: If connected to the local Python Flask backend on port 5000, it automatically talks to SQLite; otherwise it operates smoothly in interactive GitHub Pages demo mode.

## How to Enable on GitHub Pages
1. Go to your repository on GitHub: `https://github.com/tayadeaishwarya542-ui/SmartPark`
2. Click **Settings** > **Pages** (under Code and automation).
3. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`
   - **Branch**: Select `main`
   - **Folder**: Select `/docs`
4. Click **Save**.
5. Wait 1-2 minutes. Your live website URL will be:
   `https://tayadeaishwarya542-ui.github.io/SmartPark/`

