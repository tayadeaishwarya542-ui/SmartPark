/**
 * SmartPark — Smart Parking Slot Management System
 * Vanilla JavaScript Frontend Application
 * Interacts with Python Flask Backend via Fetch API
 */

// Dynamically determine backend API base URL
// Supports direct Flask serving (http://127.0.0.1:5000) or Live Server (http://127.0.0.1:5500)
const API_BASE = (window.location.protocol === 'http:' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')) ? 'http://127.0.0.1:5000' : '';

// ============================================================================
// GITHUB PAGES / OFFLINE CLIENT-SIDE PERSISTENT STORAGE ENGINE
// Allows full interactive demo on GitHub Pages without requiring Python backend.
// Persists all 12 slots, bookings, vehicle entry/exit to localStorage.
// ============================================================================
const SmartParkDemoStore = {
    KEY: 'smartpark_github_pages_demo_v1',

    getInitialSlots() {
        const slots = [];
        for (let i = 1; i <= 6; i++) {
            slots.push({
                id: i,
                slot_number: `A-0${i}`,
                vehicle_type: 'Two-Wheeler',
                status: 'available',
                current_booking: null
            });
        }
        for (let i = 1; i <= 6; i++) {
            slots.push({
                id: i + 6,
                slot_number: `B-0${i}`,
                vehicle_type: 'Four-Wheeler',
                status: 'available',
                current_booking: null
            });
        }
        return slots;
    },

    getState() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.slots) && parsed.slots.length === 12) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('localStorage read error, resetting demo state:', e);
        }

        const state = {
            slots: this.getInitialSlots(),
            bookings: [
                {
                    id: 1,
                    booking_id: 'BK-1000',
                    customer_name: 'Demo Operator',
                    vehicle_number: 'MH-12-DEMO-01',
                    vehicle_type: 'Two-Wheeler',
                    slot_id: 1,
                    slot_number: 'A-01',
                    entry_time: new Date(Date.now() - 3600000).toISOString().replace('T', ' ').slice(0, 19),
                    booking_time: new Date(Date.now() - 3600000).toISOString().replace('T', ' ').slice(0, 19),
                    exit_time: new Date(Date.now() - 1800000).toISOString().replace('T', ' ').slice(0, 19),
                    release_time: new Date(Date.now() - 1800000).toISOString().replace('T', ' ').slice(0, 19),
                    status: 'Exited'
                }
            ],
            nextId: 1001
        };
        this.saveState(state);
        return state;
    },

    saveState(state) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('localStorage save error:', e);
        }
    },

    getDashboard() {
        const state = this.getState();
        const total = state.slots.length;
        const available = state.slots.filter(s => s.status === 'available').length;
        const occupied = state.slots.filter(s => s.status === 'occupied').length;

        const parked = state.bookings.filter(b => b.status === 'Parked').length;
        const todayStr = new Date().toISOString().slice(0, 10);
        const exitedToday = state.bookings.filter(b => b.status === 'Exited' && (b.exit_time || '').startsWith(todayStr)).length;
        const totalExited = state.bookings.filter(b => b.status === 'Exited').length;

        const twSlots = state.slots.filter(s => s.vehicle_type === 'Two-Wheeler');
        const fwSlots = state.slots.filter(s => s.vehicle_type === 'Four-Wheeler');

        const breakdown = {
            'Two-Wheeler': {
                total: twSlots.length,
                available: twSlots.filter(s => s.status === 'available').length,
                occupied: twSlots.filter(s => s.status === 'occupied').length
            },
            'Four-Wheeler': {
                total: fwSlots.length,
                available: fwSlots.filter(s => s.status === 'available').length,
                occupied: fwSlots.filter(s => s.status === 'occupied').length
            }
        };

        const recentBookings = state.bookings
            .filter(b => b.status === 'Parked')
            .slice(-5)
            .reverse();

        return {
            success: true,
            data: {
                total_slots: total,
                available_slots: available,
                occupied_slots: occupied,
                parked_vehicles: parked,
                active_bookings: parked,
                exited_today: exitedToday,
                total_exited: totalExited,
                breakdown: breakdown,
                recent_bookings: recentBookings
            }
        };
    },

    getSlots(statusFilter = 'all', typeFilter = 'all') {
        const state = this.getState();
        let slots = [...state.slots];
        if (statusFilter && statusFilter !== 'all') {
            slots = slots.filter(s => s.status === statusFilter);
        }
        if (typeFilter && typeFilter !== 'all') {
            slots = slots.filter(s => s.vehicle_type === typeFilter);
        }
        return {
            success: true,
            count: slots.length,
            slots: slots
        };
    },

    createBooking(payload) {
        const state = this.getState();
        const { customer_name, vehicle_number, vehicle_type, slot_id } = payload;

        // Check duplicate active vehicle
        const activeVehicle = state.bookings.find(b => 
            b.vehicle_number.toUpperCase() === vehicle_number.toUpperCase() && b.status === 'Parked'
        );
        if (activeVehicle) {
            return {
                success: false,
                error: `Vehicle '${vehicle_number}' is already parked in Slot ${activeVehicle.slot_number} (Booking ${activeVehicle.booking_id}).`
            };
        }

        const slotIndex = state.slots.findIndex(s => s.id === Number(slot_id));
        if (slotIndex === -1) {
            return { success: false, error: 'Parking slot not found.' };
        }
        const slot = state.slots[slotIndex];
        if (slot.status !== 'available') {
            return { success: false, error: `Slot ${slot.slot_number} is currently occupied.` };
        }
        if (slot.vehicle_type !== vehicle_type) {
            return { success: false, error: `Slot ${slot.slot_number} is reserved for ${slot.vehicle_type}.` };
        }

        const now = new Date();
        const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);
        const bookingId = `BK-${state.nextId++}`;

        const newBooking = {
            id: state.bookings.length + 1,
            booking_id: bookingId,
            customer_name: customer_name.trim(),
            vehicle_number: vehicle_number.trim().toUpperCase(),
            vehicle_type: vehicle_type,
            slot_id: slot.id,
            slot_number: slot.slot_number,
            entry_time: nowStr,
            booking_time: nowStr,
            exit_time: null,
            release_time: null,
            status: 'Parked'
        };

        slot.status = 'occupied';
        slot.current_booking = {
            booking_id: bookingId,
            customer_name: newBooking.customer_name,
            vehicle_number: newBooking.vehicle_number,
            booking_time: nowStr,
            entry_time: nowStr,
            status: 'Parked'
        };

        state.bookings.push(newBooking);
        this.saveState(state);

        return {
            success: true,
            message: `Slot ${slot.slot_number} booked successfully for vehicle ${newBooking.vehicle_number}!`,
            booking: newBooking
        };
    },

    exitBooking(bookingIdOrSlotId, isSlotId = false) {
        const state = this.getState();
        let booking = null;
        let slot = null;

        if (isSlotId) {
            slot = state.slots.find(s => s.id === Number(bookingIdOrSlotId));
            if (slot && slot.current_booking) {
                booking = state.bookings.find(b => b.booking_id === slot.current_booking.booking_id);
            }
        } else {
            booking = state.bookings.find(b => b.booking_id === bookingIdOrSlotId);
            if (booking) {
                slot = state.slots.find(s => s.id === booking.slot_id);
            }
        }

        if (!booking) {
            return { success: false, error: 'Booking not found.' };
        }

        if (booking.status === 'Exited') {
            return { success: false, error: `Vehicle '${booking.vehicle_number}' (Booking ${booking.booking_id}) has already exited / checked out.` };
        }

        const now = new Date();
        const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);

        booking.status = 'Exited';
        booking.exit_time = nowStr;
        booking.release_time = nowStr;

        if (slot) {
            slot.status = 'available';
            slot.current_booking = null;
        }

        this.saveState(state);

        return {
            success: true,
            message: `Vehicle ${booking.vehicle_number} (Slot ${booking.slot_number}) has successfully exited and logged out.`,
            booking: booking
        };
    },

    getBookings(statusFilter = 'all', searchQuery = '') {
        const state = this.getState();
        let list = [...state.bookings].reverse();

        if (statusFilter && statusFilter !== 'all') {
            const filterLower = statusFilter.toLowerCase();
            if (filterLower === 'parked' || filterLower === 'active') {
                list = list.filter(b => b.status === 'Parked');
            } else if (filterLower === 'exited' || filterLower === 'completed') {
                list = list.filter(b => b.status === 'Exited');
            }
        }

        if (searchQuery) {
            const q = searchQuery.toUpperCase();
            list = list.filter(b => 
                (b.vehicle_number && b.vehicle_number.toUpperCase().includes(q)) ||
                (b.customer_name && b.customer_name.toUpperCase().includes(q)) ||
                (b.booking_id && b.booking_id.toUpperCase().includes(q))
            );
        }

        return {
            success: true,
            count: list.length,
            bookings: list
        };
    }
};

// Detect if environment should run client-side storage
const isGitHubPagesOrStatic = (
    window.location.protocol === 'file:' ||
    window.location.hostname.includes('github.io') ||
    window.location.hostname.endsWith('github.dev') ||
    window.location.hostname.endsWith('gitpod.io') ||
    (window.location.port !== '5000' && window.location.port !== '')
);


// Application State
const AppState = {
    currentView: 'dashboard',
    slots: [],
    dashboard: null,
    historyFilter: 'all',
    searchQuery: '',
    slotPendingRelease: null,
    isSubmitting: false,
    isConnected: false
};

// ============================================================================
// INITIALIZATION & EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initClock();
    initFormHandlers();
    initModalHandlers();
    initHistoryControls();
    initMobileSidebar();

    // Initial data fetch from Flask backend
    refreshAllData();

    // Listen to hash changes in URL
    window.addEventListener('hashchange', handleHashChange);
    if (window.location.hash) {
        handleHashChange();
    }
});

// ============================================================================
// NAVIGATION & VIEW ROUTING
// ============================================================================

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            if (targetView) {
                switchView(targetView);
            }
        });
    });

    // Quick Action buttons navigating to other views
    const goToBookingBtn = document.getElementById('goToBookingBtn');
    if (goToBookingBtn) {
        goToBookingBtn.addEventListener('click', () => switchView('book'));
    }

    const viewAllBookingsBtn = document.getElementById('viewAllBookingsBtn');
    if (viewAllBookingsBtn) {
        viewAllBookingsBtn.addEventListener('click', () => switchView('history'));
    }

    // Topbar Refresh Button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            animateRefreshBtn();
            refreshAllData();
            showToast('Fetching latest parking slot data...', 'info');
        });
    }

    // Slots Filter Change Event Listeners
    const filterSlotType = document.getElementById('filterSlotType');
    if (filterSlotType) {
        filterSlotType.addEventListener('change', renderSlotsGrid);
    }
    const filterSlotStatus = document.getElementById('filterSlotStatus');
    if (filterSlotStatus) {
        filterSlotStatus.addEventListener('change', renderSlotsGrid);
    }
}

function handleHashChange() {
    const hash = window.location.hash.replace('#', '');
    if (['dashboard', 'slots', 'book', 'history'].includes(hash)) {
        switchView(hash, false);
    }
}

function switchView(viewName, updateHash = true) {
    if (!['dashboard', 'slots', 'book', 'history'].includes(viewName)) return;

    AppState.currentView = viewName;
    if (updateHash) {
        window.location.hash = viewName;
    }

    // Update active nav link
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-view') === viewName);
    });

    // Update view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    // Update breadcrumb
    const titleMap = {
        'dashboard': 'Dashboard',
        'slots': 'Parking Slots',
        'book': 'Book Vehicle',
        'history': 'Booking History'
    };
    const currentViewTitle = document.getElementById('currentViewTitle');
    if (currentViewTitle) {
        currentViewTitle.textContent = titleMap[viewName] || 'Dashboard';
    }

    // Close mobile sidebar if open
    closeMobileSidebar();

    // Trigger specific view refresh
    if (viewName === 'slots') {
        renderSlotsGrid();
    } else if (viewName === 'history') {
        fetchHistory();
    } else if (viewName === 'book') {
        const vehicleType = document.querySelector('input[name="vehicleType"]:checked')?.value || 'Two-Wheeler';
        updateAvailableSlotsDropdown(vehicleType);
    }
}

function animateRefreshBtn() {
    const icon = document.getElementById('refreshIcon');
    if (icon) {
        icon.style.display = 'inline-block';
        icon.style.transform = 'rotate(360deg)';
        icon.style.transition = 'transform 0.6s ease';
        setTimeout(() => {
            icon.style.transform = 'none';
            icon.style.transition = 'none';
        }, 600);
    }
}

function initMobileSidebar() {
    const openBtn = document.getElementById('openSidebarBtn');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const sidebar = document.getElementById('sidebar');

    if (openBtn && sidebar) {
        openBtn.addEventListener('click', () => sidebar.classList.add('open'));
    }
    if (closeBtn && sidebar) {
        closeBtn.addEventListener('click', () => sidebar.classList.remove('open'));
    }
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
}

function initClock() {
    const clockEl = document.getElementById('systemClock');
    function tick() {
        const now = new Date();
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }
    tick();
    setInterval(tick, 1000);
}

function updateConnectionStatus(isOnline) {
    AppState.isConnected = isOnline;
    const dot = document.getElementById('connectionStatusDot');
    const text = document.getElementById('connectionStatusText');
    const banner = document.getElementById('backendOfflineBanner');

    if (dot) {
        dot.style.backgroundColor = isOnline ? 'var(--color-success)' : 'var(--color-danger)';
        dot.className = isOnline ? 'status-dot pulse' : 'status-dot';
    }
    if (text) {
        text.textContent = isOnline ? 'SQLite Connected' : 'Offline (Port 5000)';
    }
    if (banner) {
        banner.classList.toggle('d-none', isOnline);
    }
}

// ============================================================================
// DATA FETCHING & SYNCHRONIZATION
// ============================================================================

async function refreshAllData() {
    try {
        await Promise.all([
            fetchDashboardData(),
            fetchSlotsData(),
            fetchHistory()
        ]);
        updateConnectionStatus(true);
    } catch (err) {
        console.warn('Backend connection issue:', err);
        updateConnectionStatus(false);
    }
}

/**
 * Fetch dashboard statistics from GET /api/dashboard
 */
async function fetchDashboardData() {
    if (isGitHubPagesOrStatic) {
        const result = SmartParkDemoStore.getDashboard();
        AppState.dashboard = result.data;
        updateDashboardUI(result.data);
        updateConnectionStatus(true, true);
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/dashboard`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();

        if (result.success && result.data) {
            AppState.dashboard = result.data;
            updateDashboardUI(result.data);
            updateConnectionStatus(true, false);
        }
    } catch (err) {
        console.warn('Backend unavailable, activating local demo storage:', err);
        const result = SmartParkDemoStore.getDashboard();
        AppState.dashboard = result.data;
        updateDashboardUI(result.data);
        updateConnectionStatus(true, true);
    }
}

/**
 * Update Dashboard KPI cards, zone meters, and recent bookings table
 */
function updateDashboardUI(data) {
    if (!data) return;

    // 1. KPI Cards
    const kpiTotal = document.getElementById('kpiTotalSlots');
    const kpiAvail = document.getElementById('kpiAvailableSlots');
    const kpiOccupied = document.getElementById('kpiOccupiedSlots');
    const kpiParked = document.getElementById('kpiParkedVehicles');
    const kpiActive = document.getElementById('kpiActiveBookings');
    const kpiExited = document.getElementById('kpiExitedToday');
    const navBadge = document.getElementById('navAvailableCount');

    const parkedCount = data.parked_vehicles ?? data.active_bookings ?? 0;
    const exitedCount = data.exited_today ?? 0;

    if (kpiTotal) kpiTotal.textContent = data.total_slots;
    if (kpiAvail) kpiAvail.textContent = data.available_slots;
    if (kpiOccupied) kpiOccupied.textContent = data.occupied_slots;
    if (kpiParked) kpiParked.textContent = parkedCount;
    if (kpiActive) kpiActive.textContent = parkedCount;
    if (kpiExited) kpiExited.textContent = exitedCount;
    if (navBadge) navBadge.textContent = `${data.available_slots} Free`;

    // 2. Zone Breakdown Progress Bars
    const breakdown = data.breakdown || {};
    const tw = breakdown['Two-Wheeler'] || { total: 6, available: 6, occupied: 0 };
    const fw = breakdown['Four-Wheeler'] || { total: 6, available: 6, occupied: 0 };

    const twPercent = tw.total > 0 ? Math.round((tw.occupied / tw.total) * 100) : 0;
    const fwPercent = fw.total > 0 ? Math.round((fw.occupied / fw.total) * 100) : 0;

    const twBar = document.getElementById('zoneTwoWheelBar');
    const twCount = document.getElementById('zoneTwoWheelCount');
    const twPercentEl = document.getElementById('zoneTwoWheelPercent');
    const twAvailEl = document.getElementById('zoneTwoWheelAvail');

    if (twBar) twBar.style.width = `${twPercent}%`;
    if (twCount) twCount.textContent = `${tw.available} Available`;
    if (twPercentEl) twPercentEl.textContent = `${twPercent}%`;
    if (twAvailEl) twAvailEl.textContent = `${tw.available} / ${tw.total}`;

    const fwBar = document.getElementById('zoneFourWheelBar');
    const fwCount = document.getElementById('zoneFourWheelCount');
    const fwPercentEl = document.getElementById('zoneFourWheelPercent');
    const fwAvailEl = document.getElementById('zoneFourWheelAvail');

    if (fwBar) fwBar.style.width = `${fwPercent}%`;
    if (fwCount) fwCount.textContent = `${fw.available} Available`;
    if (fwPercentEl) fwPercentEl.textContent = `${fwPercent}%`;
    if (fwAvailEl) fwAvailEl.textContent = `${fw.available} / ${fw.total}`;

    // Quick stats on booking page sidebar
    const qTw = document.getElementById('quickTwoAvail');
    const qFw = document.getElementById('quickFourAvail');
    if (qTw) qTw.textContent = `${tw.available} of ${tw.total} Free`;
    if (qFw) qFw.textContent = `${fw.available} of ${fw.total} Free`;

    // 3. Recent Bookings Table
    renderRecentBookings(data.recent_bookings || []);
}

function renderRecentBookings(bookings) {
    const tbody = document.getElementById('recentBookingsTbody');
    if (!tbody) return;

    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-muted">
                    No active parking sessions right now. All slots are free!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = bookings.map(b => `
        <tr>
            <td><span class="badge badge-outline">${escapeHtml(b.booking_id)}</span></td>
            <td><strong>${escapeHtml(b.customer_name)}</strong></td>
            <td><span class="plate-badge">${escapeHtml(b.vehicle_number)}</span></td>
            <td>${b.vehicle_type === 'Two-Wheeler' ? '🛵 Two-Wheeler' : '🚗 Four-Wheeler'}</td>
            <td><strong class="text-primary">${escapeHtml(b.slot_number)}</strong></td>
            <td>${formatDate(b.entry_time || b.booking_time)}</td>
            <td><span class="badge badge-parked">🅿️ Parked</span></td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="promptReleaseBooking('${escapeHtml(b.booking_id)}')">
                    <span class="btn-icon">🚪</span> Exit / Logout
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Fetch all slots from GET /api/slots
 */
async function fetchSlotsData() {
    try {
        const response = await fetch(`${API_BASE}/api/slots`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();

        if (result.success && Array.isArray(result.slots)) {
            AppState.slots = result.slots;
            renderMiniSlotsMatrix(result.slots);
            renderSlotsGrid();
            
            // Also update booking dropdown if on book page
            const selectedType = document.querySelector('input[name="vehicleType"]:checked')?.value || 'Two-Wheeler';
            updateAvailableSlotsDropdown(selectedType);
            updateConnectionStatus(true);
        }
    } catch (err) {
        console.error('Failed to fetch slots data:', err);
        updateConnectionStatus(false);
    }
}

/**
 * Render 12 mini slot cards in the Dashboard Matrix
 */
function renderMiniSlotsMatrix(slots) {
    const grid = document.getElementById('miniSlotsGrid');
    if (!grid) return;

    if (!slots || slots.length === 0) {
        grid.innerHTML = '<div class="loading-state">No slots initialized. Please check Flask server.</div>';
        return;
    }

    grid.innerHTML = slots.map(slot => {
        const isAvail = slot.status === 'available';
        const typeIcon = slot.vehicle_type === 'Two-Wheeler' ? '🛵' : '🚗';
        return `
            <div class="mini-slot-card ${isAvail ? 'available' : 'occupied'}" 
                 onclick="handleMiniSlotClick(${slot.id})"
                 title="${slot.slot_number} (${slot.vehicle_type}) - ${isAvail ? 'Click to Book' : 'Occupied (Click to Release)'}">
                <span class="mini-slot-number">${escapeHtml(slot.slot_number)}</span>
                <span class="mini-slot-type">${typeIcon} ${slot.vehicle_type === 'Two-Wheeler' ? '2W' : '4W'}</span>
                <span class="mini-slot-status">${isAvail ? 'Available' : 'Occupied'}</span>
            </div>
        `;
    }).join('');
}

function handleMiniSlotClick(slotId) {
    const slot = AppState.slots.find(s => s.id === slotId);
    if (!slot) return;

    if (slot.status === 'available') {
        preselectSlotForBooking(slot.id, slot.vehicle_type);
    } else {
        promptReleaseSlot(slot.id);
    }
}

// ============================================================================
// PARKING SLOTS MANAGEMENT VIEW
// ============================================================================

function renderSlotsGrid() {
    const grid = document.getElementById('slotsGrid');
    const summary = document.getElementById('slotFilterSummary');
    if (!grid) return;

    if (!AppState.slots || AppState.slots.length === 0) {
        grid.innerHTML = '<div class="loading-state">Loading parking slots from backend...</div>';
        return;
    }

    const typeFilter = document.getElementById('filterSlotType')?.value || 'all';
    const statusFilter = document.getElementById('filterSlotStatus')?.value || 'all';

    // Apply client-side filters
    const filteredSlots = AppState.slots.filter(s => {
        if (typeFilter !== 'all' && s.vehicle_type !== typeFilter) return false;
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        return true;
    });

    if (summary) {
        summary.innerHTML = `Showing <strong>${filteredSlots.length}</strong> of <strong>${AppState.slots.length}</strong> slots`;
    }

    if (filteredSlots.length === 0) {
        grid.innerHTML = `
            <div class="loading-state">
                <p>No parking slots match the selected filters.</p>
                <button class="btn btn-secondary btn-sm mt-2" onclick="resetSlotFilters()">Reset Filters</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredSlots.map(slot => {
        const isAvail = slot.status === 'available';
        const typeIcon = slot.vehicle_type === 'Two-Wheeler' ? '🛵' : '🚗';

        return `
            <div class="slot-card ${isAvail ? 'available' : 'occupied'}" id="slot-card-${slot.id}">
                <div>
                    <div class="slot-card-top">
                        <span class="slot-num-badge">${escapeHtml(slot.slot_number)}</span>
                        <span class="slot-status-pill">${isAvail ? '● Available' : '● Occupied'}</span>
                    </div>

                    <div class="slot-type-row">
                        <span>${typeIcon}</span>
                        <span>${escapeHtml(slot.vehicle_type)} Zone</span>
                    </div>

                    ${isAvail ? `
                        <div class="slot-available-message">
                            Ready for immediate parking assignment
                        </div>
                    ` : `
                        <div class="slot-occupancy-info">
                            <div class="info-row">
                                <span class="info-lbl">Plate:</span>
                                <strong class="plate-badge">${escapeHtml(slot.current_booking?.vehicle_number || 'N/A')}</strong>
                            </div>
                            <div class="info-row">
                                <span class="info-lbl">Customer:</span>
                                <span>${escapeHtml(slot.current_booking?.customer_name || 'N/A')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-lbl">Parked At:</span>
                                <span>${formatDate(slot.current_booking?.booking_time)}</span>
                            </div>
                        </div>
                    `}
                </div>

                <div class="slot-action-area">
                    ${isAvail ? `
                        <button class="slot-action-btn btn-book-slot" onclick="preselectSlotForBooking(${slot.id}, '${slot.vehicle_type}')">
                            <span>➕</span> Book Slot
                        </button>
                    ` : `
                        <button class="slot-action-btn btn-release-slot" onclick="promptReleaseSlot(${slot.id})">
                            <span>🚪</span> Vehicle Exit / Logout
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function resetSlotFilters() {
    const typeSelect = document.getElementById('filterSlotType');
    const statusSelect = document.getElementById('filterSlotStatus');
    if (typeSelect) typeSelect.value = 'all';
    if (statusSelect) statusSelect.value = 'all';
    renderSlotsGrid();
}

// ============================================================================
// VEHICLE BOOKING VIEW & FORM
// ============================================================================

function initFormHandlers() {
    const bookingForm = document.getElementById('bookingForm');
    const vehicleTypeRadios = document.querySelectorAll('input[name="vehicleType"]');

    vehicleTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateAvailableSlotsDropdown(e.target.value);
        });
    });

    if (bookingForm) {
        bookingForm.addEventListener('submit', handleBookingSubmit);
    }

    const vehicleInput = document.getElementById('vehicleNumber');
    if (vehicleInput) {
        vehicleInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
}

/**
 * Switch to Booking tab and pre-select a specific slot
 */
function preselectSlotForBooking(slotId, vehicleType) {
    switchView('book');

    const radio = document.querySelector(`input[name="vehicleType"][value="${vehicleType}"]`);
    if (radio) {
        radio.checked = true;
    }

    updateAvailableSlotsDropdown(vehicleType, slotId);

    setTimeout(() => {
        const nameInput = document.getElementById('customerName');
        if (nameInput) nameInput.focus();
    }, 150);
}

/**
 * Filter and populate available slots dropdown based on vehicle type
 */
function updateAvailableSlotsDropdown(vehicleType, preselectedSlotId = null) {
    const select = document.getElementById('slotSelect');
    const hint = document.getElementById('slotSelectHint');
    if (!select) return;

    const availableSlots = AppState.slots.filter(s => s.vehicle_type === vehicleType && s.status === 'available');

    select.innerHTML = '';

    if (availableSlots.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = `❌ No available slots for ${vehicleType}`;
        select.appendChild(option);
        select.disabled = true;

        if (hint) {
            hint.textContent = `⚠️ All ${vehicleType} slots are currently occupied. Please release a slot to book.`;
            hint.style.color = 'var(--color-danger)';
        }
        return;
    }

    select.disabled = false;
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = `-- Choose a ${vehicleType} Slot (${availableSlots.length} Available) --`;
    select.appendChild(defaultOption);

    availableSlots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot.id;
        option.textContent = `Bay ${slot.slot_number} (Zone ${slot.slot_number.startsWith('A') ? 'A' : 'B'} - Available)`;
        if (preselectedSlotId && slot.id === parseInt(preselectedSlotId, 10)) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    if (hint) {
        hint.textContent = `Found ${availableSlots.length} available slots for ${vehicleType}.`;
        hint.style.color = 'var(--color-success-hover)';
    }
}

/**
 * Handle Booking Form Submission
 */
async function handleBookingSubmit(e) {
    e.preventDefault();
    if (AppState.isSubmitting) return;

    const submitBtn = document.getElementById('submitBookingBtn');

    const customerName = document.getElementById('customerName')?.value.trim();
    const vehicleNumber = document.getElementById('vehicleNumber')?.value.trim().toUpperCase();
    const vehicleType = document.querySelector('input[name="vehicleType"]:checked')?.value;
    const slotId = document.getElementById('slotSelect')?.value;

    if (!customerName || customerName.length < 2) {
        displayFormAlert('Please enter a valid customer name (at least 2 characters).', 'danger');
        return;
    }
    if (!vehicleNumber || vehicleNumber.length < 3) {
        displayFormAlert('Please enter a valid vehicle registration number (e.g., MH-12-AB-1234).', 'danger');
        return;
    }
    if (!slotId) {
        displayFormAlert('Please select an available parking slot from the dropdown.', 'danger');
        return;
    }

    AppState.isSubmitting = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="btn-icon">⏳</span> Saving Booking...';
    }

    try {
        let result;
        if (isGitHubPagesOrStatic) {
            result = SmartParkDemoStore.createBooking({
                customer_name: customerName,
                vehicle_number: vehicleNumber,
                vehicle_type: vehicleType,
                slot_id: parseInt(slotId, 10)
            });
        } else {
            try {
                const response = await fetch(`${API_BASE}/api/bookings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customer_name: customerName,
                        vehicle_number: vehicleNumber,
                        vehicle_type: vehicleType,
                        slot_id: parseInt(slotId, 10)
                    })
                });
                result = await response.json();
            } catch (netErr) {
                result = SmartParkDemoStore.createBooking({
                    customer_name: customerName,
                    vehicle_number: vehicleNumber,
                    vehicle_type: vehicleType,
                    slot_id: parseInt(slotId, 10)
                });
            }
        }

        if (result.success) {
            displayFormAlert(`✅ Success! Booking ${result.booking.booking_id} created for Vehicle ${result.booking.vehicle_number} in Slot ${result.booking.slot_number}.`, 'success');
            showToast(`Slot ${result.booking.slot_number} booked successfully!`, 'success');

            document.getElementById('bookingForm').reset();
            const radio = document.querySelector('input[name="vehicleType"][value="Two-Wheeler"]');
            if (radio) radio.checked = true;

            await refreshAllData();
            updateAvailableSlotsDropdown('Two-Wheeler');

        } else {
            displayFormAlert(result.error || 'Failed to complete booking. Please check details.', 'danger');
            showToast(result.error || 'Booking failed', 'danger');
        }

    } catch (err) {
        console.error('Error submitting booking:', err);
        displayFormAlert('Server communication error. Please ensure Flask is running on http://127.0.0.1:5000.', 'danger');
        showToast('Network error while booking', 'danger');
    } finally {
        AppState.isSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="btn-icon">💾</span> <span class="btn-text">Confirm & Generate Booking</span>';
        }
    }
}

function displayFormAlert(message, type) {
    const alertBox = document.getElementById('bookingAlert');
    if (!alertBox) return;

    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================================
// SLOT RELEASE CONFIRMATION MODAL
// ============================================================================

function initModalHandlers() {
    const modal = document.getElementById('releaseModal');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const confirmBtn = document.getElementById('modalConfirmReleaseBtn');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeReleaseModal);
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', executeSlotRelease);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeReleaseModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('d-none')) {
            closeReleaseModal();
        }
    });
}

function promptReleaseSlot(slotId) {
    const slot = AppState.slots.find(s => s.id === slotId);
    if (!slot) return;

    const booking = slot.current_booking || {};
    AppState.slotPendingRelease = {
        slotId: slot.id,
        bookingId: booking.booking_id,
        slotNumber: slot.slot_number
    };

    document.getElementById('modalSlotNumber').textContent = slot.slot_number;
    document.getElementById('modalVehicleNumber').textContent = booking.vehicle_number || 'Unknown';
    document.getElementById('modalCustomerName').textContent = booking.customer_name || 'Unknown';
    document.getElementById('modalBookingId').textContent = booking.booking_id || 'N/A';
    document.getElementById('modalBookingTime').textContent = formatDate(booking.booking_time);

    const modal = document.getElementById('releaseModal');
    if (modal) modal.classList.remove('d-none');
}

function promptReleaseBooking(bookingId) {
    // Find matching slot from AppState.slots
    const slot = AppState.slots.find(s => s.current_booking?.booking_id === bookingId);
    if (slot) {
        promptReleaseSlot(slot.id);
        return;
    }

    // Direct release by booking ID
    AppState.slotPendingRelease = { slotId: null, bookingId: bookingId, slotNumber: 'Assigned Slot' };

    document.getElementById('modalSlotNumber').textContent = 'Assigned Slot';
    document.getElementById('modalVehicleNumber').textContent = 'Active Vehicle';
    document.getElementById('modalCustomerName').textContent = 'Customer';
    document.getElementById('modalBookingId').textContent = bookingId;
    document.getElementById('modalBookingTime').textContent = 'Active Session';

    const modal = document.getElementById('releaseModal');
    if (modal) modal.classList.remove('d-none');
}

function closeReleaseModal() {
    const modal = document.getElementById('releaseModal');
    if (modal) modal.classList.add('d-none');
    AppState.slotPendingRelease = null;
}

async function executeSlotRelease() {
    if (!AppState.slotPendingRelease) return;

    const { slotId, bookingId, slotNumber } = AppState.slotPendingRelease;
    const confirmBtn = document.getElementById('modalConfirmReleaseBtn');

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="btn-icon">⏳</span> Checking out...';
    }

    try {
        let result;
        if (isGitHubPagesOrStatic) {
            result = bookingId ? SmartParkDemoStore.exitBooking(bookingId, false) : SmartParkDemoStore.exitBooking(slotId, true);
        } else {
            try {
                const endpoint = bookingId ? `${API_BASE}/api/bookings/${bookingId}/exit` : `${API_BASE}/api/slots/${slotId}/exit`;
                const response = await fetch(endpoint, { method: 'POST' });
                result = await response.json();
            } catch (netErr) {
                result = bookingId ? SmartParkDemoStore.exitBooking(bookingId, false) : SmartParkDemoStore.exitBooking(slotId, true);
            }
        }

        if (result.success) {
            closeReleaseModal();
            showToast(result.message || `Vehicle checked out successfully! Slot ${slotNumber} is now Available.`, 'success');
            await refreshAllData();
        } else {
            showToast(result.error || 'Failed to checkout vehicle', 'danger');
        }
    } catch (err) {
        console.error('Error exiting vehicle:', err);
        showToast('Network error while checking out vehicle', 'danger');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<span class="btn-icon">🚪</span> <span class="btn-text">Confirm Vehicle Exit</span>';
        }
    }
}

// ============================================================================
// BOOKING HISTORY & SEARCH VIEW
// ============================================================================

function initHistoryControls() {
    const searchInput = document.getElementById('historySearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const filterPills = document.querySelectorAll('.tab-pill');

    let debounceTimer;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const val = e.target.value.trim();
            if (clearBtn) {
                clearBtn.classList.toggle('d-none', val.length === 0);
            }
            debounceTimer = setTimeout(() => {
                AppState.searchQuery = val;
                fetchHistory();
            }, 300);
        });
    }

    if (clearBtn && searchInput) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.add('d-none');
            AppState.searchQuery = '';
            fetchHistory();
            searchInput.focus();
        });
    }

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            AppState.historyFilter = pill.getAttribute('data-status') || 'all';
            fetchHistory();
        });
    });
}

/**
 * Fetch booking history from GET /api/bookings with search & status filters
 */
async function fetchHistory() {
    const tbody = document.getElementById('historyTbody');
    const counter = document.getElementById('historyCounter');

    let url = `${API_BASE}/api/bookings?status=${encodeURIComponent(AppState.historyFilter)}`;
    if (AppState.searchQuery) {
        url += `&search=${encodeURIComponent(AppState.searchQuery)}`;
    }

    try {
        let result;
        if (isGitHubPagesOrStatic) {
            result = SmartParkDemoStore.getBookings(AppState.historyFilter, AppState.searchQuery);
        } else {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                result = await response.json();
            } catch (netErr) {
                result = SmartParkDemoStore.getBookings(AppState.historyFilter, AppState.searchQuery);
            }
        }

        if (result.success && Array.isArray(result.bookings)) {
            renderHistoryTable(result.bookings);
            if (counter) {
                counter.textContent = `Showing ${result.bookings.length} ${result.bookings.length === 1 ? 'record' : 'records'}`;
            }
            updateConnectionStatus(true, isGitHubPagesOrStatic);
        }
    } catch (err) {
        console.error('Failed to fetch booking history:', err);
        const result = SmartParkDemoStore.getBookings(AppState.historyFilter, AppState.searchQuery);
        renderHistoryTable(result.bookings);
    }
}

function renderHistoryTable(bookings) {
    const tbody = document.getElementById('historyTbody');
    if (!tbody) return;

    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4 text-muted">
                    No bookings found matching your search criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = bookings.map(b => {
        const status = (b.status || 'Parked').toLowerCase();
        const isParked = (status === 'parked' || status === 'active');
        const isExited = (status === 'exited' || status === 'completed');
        const isCancelled = (status === 'cancelled');

        const entryTime = b.entry_time || b.booking_time;
        const exitTime = b.exit_time || b.release_time;

        let badgeHtml = '';
        if (isParked) {
            badgeHtml = `<span class="badge badge-parked">🅿️ Parked</span>`;
        } else if (isExited) {
            badgeHtml = `<span class="badge badge-exited">🏁 Exited</span>`;
        } else if (isCancelled) {
            badgeHtml = `<span class="badge badge-cancelled">❌ Cancelled</span>`;
        } else {
            badgeHtml = `<span class="badge badge-outline">${escapeHtml(b.status)}</span>`;
        }

        let actionHtml = '';
        if (isParked) {
            actionHtml = `
                <button class="btn btn-danger btn-sm" onclick="promptReleaseBooking('${escapeHtml(b.booking_id)}')">
                    <span class="btn-icon">🚪</span> Exit / Logout
                </button>
            `;
        } else if (isExited) {
            actionHtml = `<span class="badge badge-exited">Exited</span>`;
        } else {
            actionHtml = `<span class="text-muted text-center" style="display:block;">—</span>`;
        }

        return `
            <tr>
                <td><span class="badge badge-outline">${escapeHtml(b.booking_id)}</span></td>
                <td><strong>${escapeHtml(b.customer_name)}</strong></td>
                <td><span class="plate-badge">${escapeHtml(b.vehicle_number)}</span></td>
                <td>${b.vehicle_type === 'Two-Wheeler' ? '🛵 Two-Wheeler' : '🚗 Four-Wheeler'}</td>
                <td><strong class="text-primary">${escapeHtml(b.slot_number)}</strong></td>
                <td>${formatDate(entryTime)}</td>
                <td>${exitTime ? formatDate(exitTime) : '<span class="text-muted">Currently Parked</span>'}</td>
                <td>${badgeHtml}</td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const iconMap = {
        'success': '✅',
        'danger': '❌',
        'info': 'ℹ️',
        'warning': '⚠️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${iconMap[type] || 'ℹ️'}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr.replace(' ', 'T'));
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
               d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}
