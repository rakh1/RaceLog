// RaceLog Frontend JavaScript

// Handle 401 unauthorized responses
function handleUnauthorized() {
    window.location.href = '/login.html';
}

// API Helper Functions
const api = {
    async get(url) {
        const response = await fetch(url);
        if (response.status === 401) {
            handleUnauthorized();
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    },

    async post(url, data) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.status === 401) {
            handleUnauthorized();
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    },

    async put(url, data) {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.status === 401) {
            handleUnauthorized();
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    },

    async delete(url) {
        const response = await fetch(url, { method: 'DELETE' });
        if (response.status === 401) {
            handleUnauthorized();
            throw new Error('Unauthorized');
        }
        if (!response.ok && response.status !== 204) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return true;
    }
};

// Auth Functions
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();
        if (!data.authenticated) {
            window.location.href = '/login.html';
            return null;
        }
        return data.username;
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = '/login.html';
        return null;
    }
}

function updateUserDisplay(username) {
    const usernameEl = document.getElementById('current-username');
    if (usernameEl && username) {
        usernameEl.textContent = username;
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('Error logging out:', error);
    }
    window.location.href = '/login.html';
}

// Modal Helpers
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Click outside modal to close
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeAllModals();
    }
});

// Escape key to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllModals();
    }
});

// URL Parameter Helper
function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
}

// ============ CARS PAGE ============

async function loadCars() {
    const carsContainer = document.getElementById('cars-list');
    if (!carsContainer) return;

    try {
        const cars = await api.get('/api/cars');

        if (cars.length === 0) {
            carsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No cars yet</h3>
                    <p>Add your first car to get started</p>
                </div>
            `;
            return;
        }

        carsContainer.innerHTML = cars.map(car => `
            <div class="list-item">
                <div class="list-item-content">
                    <h3>${escapeHtml(car.name)}</h3>
                    <p>${escapeHtml(car.manufacturer || '')}${car.manufacturer && car.series ? ' - ' : ''}${escapeHtml(car.series || '')}${!car.manufacturer && !car.series ? 'No details specified' : ''}</p>
                </div>
                <div class="list-item-actions">
                    <a href="car.html?id=${car.id}" class="btn btn-primary btn-sm">Setups</a>
                    <a href="maintenance.html?id=${car.id}" class="btn btn-primary btn-sm">Maintenance</a>
                    <button class="btn btn-secondary btn-sm" onclick="editCar('${car.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteCar('${car.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading cars:', error);
        carsContainer.innerHTML = '<p class="text-center text-muted">Error loading cars</p>';
    }
}

async function saveCar(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.carId;

    const carData = {
        name: form.carName.value,
        manufacturer: form.carManufacturer.value,
        series: form.carSeries.value
    };

    try {
        if (id) {
            await api.put(`/api/cars/${id}`, carData);
        } else {
            await api.post('/api/cars', carData);
        }
        closeModal('car-modal');
        form.reset();
        delete form.dataset.carId;
        loadCars();
    } catch (error) {
        console.error('Error saving car:', error);
        alert('Error saving car');
    }
}

async function editCar(id) {
    try {
        const car = await api.get(`/api/cars/${id}`);
        const form = document.getElementById('car-form');
        form.carName.value = car.name;
        form.carManufacturer.value = car.manufacturer || '';
        form.carSeries.value = car.series;
        form.dataset.carId = id;
        document.getElementById('car-modal-title').textContent = 'Edit Car';
        openModal('car-modal');
    } catch (error) {
        console.error('Error loading car:', error);
        alert('Error loading car');
    }
}

async function deleteCar(id) {
    if (!confirm('Are you sure you want to delete this car? All related setups, track notes, and maintenance records will also be deleted.')) {
        return;
    }

    try {
        await api.delete(`/api/cars/${id}`);
        loadCars();
    } catch (error) {
        console.error('Error deleting car:', error);
        alert('Error deleting car');
    }
}

function showAddCarModal() {
    const form = document.getElementById('car-form');
    form.reset();
    delete form.dataset.carId;
    document.getElementById('car-modal-title').textContent = 'Add Car';
    openModal('car-modal');
}

// ============ SINGLE CAR PAGE ============

async function loadCarDetails() {
    const carId = getUrlParam('id');
    if (!carId) {
        window.location.href = '/';
        return;
    }

    try {
        const car = await api.get(`/api/cars/${carId}`);
        document.getElementById('car-name-breadcrumb').textContent = car.name;
        document.getElementById('car-name-title').textContent = car.name;
        const details = [car.manufacturer, car.series].filter(Boolean).join(' - ') || 'No details';
        document.getElementById('car-series').textContent = details;

        // Load setups for this car
        loadSetups(carId);
    } catch (error) {
        console.error('Error loading car:', error);
        alert('Car not found');
        window.location.href = '/';
    }
}

async function loadSetups(carId) {
    const setupsContainer = document.getElementById('setups-list');
    if (!setupsContainer) return;

    try {
        const [setups, tracks] = await Promise.all([
            api.get(`/api/setups?carId=${carId}`),
            api.get('/api/tracks')
        ]);

        const tracksMap = {};
        tracks.forEach(t => tracksMap[t.id] = t);

        if (setups.length === 0) {
            setupsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No setups yet</h3>
                    <p>Add your first setup for this car</p>
                </div>
            `;
            return;
        }

        setupsContainer.innerHTML = setups.map(setup => {
            const track = setup.trackId ? tracksMap[setup.trackId] : null;
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <h3>${escapeHtml(setup.name)}</h3>
                        <p>${formatDate(setup.date)}${track ? ' - ' + escapeHtml(track.name) : ''}</p>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-primary btn-sm" onclick="viewSetup('${setup.id}')">View</button>
                        <button class="btn btn-secondary btn-sm" onclick="editSetup('${setup.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteSetup('${setup.id}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading setups:', error);
        setupsContainer.innerHTML = '<p class="text-center text-muted">Error loading setups</p>';
    }
}

async function showAddSetupModal() {
    const form = document.getElementById('setup-form');
    form.reset();
    delete form.dataset.setupId;
    document.getElementById('setup-modal-title').textContent = 'Add Setup';

    // Load tracks for dropdown
    await loadTrackDropdown('setupTrack');

    // Set today's date
    form.setupDate.value = new Date().toISOString().split('T')[0];

    openModal('setup-modal');
}

async function loadTrackDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const tracks = await api.get('/api/tracks');
        select.innerHTML = '<option value="">No track selected</option>' +
            tracks.map(track => `<option value="${track.id}">${escapeHtml(track.name)}</option>`).join('');
    } catch (error) {
        console.error('Error loading tracks:', error);
    }
}

async function saveSetup(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.setupId;
    const carId = getUrlParam('id');

    const setupData = {
        carId: carId,
        trackId: form.setupTrack.value || null,
        name: form.setupName.value,
        date: form.setupDate.value,
        toeFront: form.toeFront.value,
        toeRear: form.toeRear.value,
        camberFront: form.camberFront.value,
        camberRear: form.camberRear.value,
        casterFront: form.casterFront.value,
        cornerWeights: {
            fl: parseFloat(form.cwFL.value) || 0,
            fr: parseFloat(form.cwFR.value) || 0,
            rl: parseFloat(form.cwRL.value) || 0,
            rr: parseFloat(form.cwRR.value) || 0
        },
        totalWeight: parseFloat(form.totalWeight.value) || 0,
        rideHeightFront: form.rideHeightFront.value,
        rideHeightRear: form.rideHeightRear.value,
        antiRollBarFront: form.antiRollBarFront.value,
        antiRollBarRear: form.antiRollBarRear.value,
        tyrePressures: {
            fl: parseFloat(form.tpFL.value) || 0,
            fr: parseFloat(form.tpFR.value) || 0,
            rl: parseFloat(form.tpRL.value) || 0,
            rr: parseFloat(form.tpRR.value) || 0
        },
        fuelQuantity: form.fuelQuantity.value,
        tyreMake: form.tyreMake.value,
        notes: form.setupNotes.value
    };

    try {
        if (id) {
            await api.put(`/api/setups/${id}`, setupData);
        } else {
            await api.post('/api/setups', setupData);
        }
        closeModal('setup-modal');
        form.reset();
        delete form.dataset.setupId;
        loadSetups(carId);
    } catch (error) {
        console.error('Error saving setup:', error);
        alert('Error saving setup');
    }
}

async function editSetup(id) {
    try {
        const setup = await api.get(`/api/setups/${id}`);
        const form = document.getElementById('setup-form');

        await loadTrackDropdown('setupTrack');

        form.setupTrack.value = setup.trackId || '';
        form.setupName.value = setup.name;
        form.setupDate.value = setup.date;
        form.toeFront.value = setup.toeFront || '';
        form.toeRear.value = setup.toeRear || '';
        form.camberFront.value = setup.camberFront || '';
        form.camberRear.value = setup.camberRear || '';
        form.casterFront.value = setup.casterFront || '';
        form.cwFL.value = setup.cornerWeights?.fl || '';
        form.cwFR.value = setup.cornerWeights?.fr || '';
        form.cwRL.value = setup.cornerWeights?.rl || '';
        form.cwRR.value = setup.cornerWeights?.rr || '';
        form.totalWeight.value = setup.totalWeight || '';
        form.rideHeightFront.value = setup.rideHeightFront || '';
        form.rideHeightRear.value = setup.rideHeightRear || '';
        form.antiRollBarFront.value = setup.antiRollBarFront || '';
        form.antiRollBarRear.value = setup.antiRollBarRear || '';
        form.tpFL.value = setup.tyrePressures?.fl || '';
        form.tpFR.value = setup.tyrePressures?.fr || '';
        form.tpRL.value = setup.tyrePressures?.rl || '';
        form.tpRR.value = setup.tyrePressures?.rr || '';
        form.fuelQuantity.value = setup.fuelQuantity || '';
        form.tyreMake.value = setup.tyreMake || '';
        form.setupNotes.value = setup.notes || '';

        form.dataset.setupId = id;
        document.getElementById('setup-modal-title').textContent = 'Edit Setup';
        openModal('setup-modal');
    } catch (error) {
        console.error('Error loading setup:', error);
        alert('Error loading setup');
    }
}

async function viewSetup(id) {
    try {
        const setup = await api.get(`/api/setups/${id}`);
        const tracks = await api.get('/api/tracks');
        const track = setup.trackId ? tracks.find(t => t.id === setup.trackId) : null;

        const detailsHtml = `
            <div class="setup-details">
                <div class="detail-group">
                    <h4>General</h4>
                    <div class="detail-row">
                        <span class="detail-label">Date</span>
                        <span class="detail-value">${formatDate(setup.date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Track</span>
                        <span class="detail-value">${track ? escapeHtml(track.name) : 'None'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Tyre Make</span>
                        <span class="detail-value">${escapeHtml(setup.tyreMake) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Fuel Quantity</span>
                        <span class="detail-value">${escapeHtml(setup.fuelQuantity) || '-'}</span>
                    </div>
                </div>

                <div class="detail-group">
                    <h4>Alignment</h4>
                    <div class="detail-row">
                        <span class="detail-label">Toe Front</span>
                        <span class="detail-value">${escapeHtml(setup.toeFront) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Toe Rear</span>
                        <span class="detail-value">${escapeHtml(setup.toeRear) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Camber Front</span>
                        <span class="detail-value">${escapeHtml(setup.camberFront) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Camber Rear</span>
                        <span class="detail-value">${escapeHtml(setup.camberRear) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Caster Front</span>
                        <span class="detail-value">${escapeHtml(setup.casterFront) || '-'}</span>
                    </div>
                </div>

                <div class="detail-group">
                    <h4>Corner Weights</h4>
                    <div class="detail-row">
                        <span class="detail-label">Front Left</span>
                        <span class="detail-value">${setup.cornerWeights?.fl || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Front Right</span>
                        <span class="detail-value">${setup.cornerWeights?.fr || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Rear Left</span>
                        <span class="detail-value">${setup.cornerWeights?.rl || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Rear Right</span>
                        <span class="detail-value">${setup.cornerWeights?.rr || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Weight</span>
                        <span class="detail-value">${setup.totalWeight || '-'}</span>
                    </div>
                </div>

                <div class="detail-group">
                    <h4>Suspension</h4>
                    <div class="detail-row">
                        <span class="detail-label">Ride Height Front</span>
                        <span class="detail-value">${escapeHtml(setup.rideHeightFront) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Ride Height Rear</span>
                        <span class="detail-value">${escapeHtml(setup.rideHeightRear) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Anti-Roll Bar Front</span>
                        <span class="detail-value">${escapeHtml(setup.antiRollBarFront) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Anti-Roll Bar Rear</span>
                        <span class="detail-value">${escapeHtml(setup.antiRollBarRear) || '-'}</span>
                    </div>
                </div>

                <div class="detail-group">
                    <h4>Tyre Pressures</h4>
                    <div class="detail-row">
                        <span class="detail-label">Front Left</span>
                        <span class="detail-value">${setup.tyrePressures?.fl || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Front Right</span>
                        <span class="detail-value">${setup.tyrePressures?.fr || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Rear Left</span>
                        <span class="detail-value">${setup.tyrePressures?.rl || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Rear Right</span>
                        <span class="detail-value">${setup.tyrePressures?.rr || '-'}</span>
                    </div>
                </div>
            </div>

            ${setup.notes ? `
                <div class="mt-4">
                    <h4 class="section-title">Notes</h4>
                    <p>${escapeHtml(setup.notes).replace(/\n/g, '<br>')}</p>
                </div>
            ` : ''}
        `;

        document.getElementById('setup-view-title').textContent = setup.name;
        document.getElementById('setup-view-content').innerHTML = detailsHtml;
        openModal('setup-view-modal');
    } catch (error) {
        console.error('Error loading setup:', error);
        alert('Error loading setup');
    }
}

async function deleteSetup(id) {
    if (!confirm('Are you sure you want to delete this setup?')) {
        return;
    }

    try {
        await api.delete(`/api/setups/${id}`);
        loadSetups(getUrlParam('id'));
    } catch (error) {
        console.error('Error deleting setup:', error);
        alert('Error deleting setup');
    }
}

// ============ MAINTENANCE PAGE ============

async function loadMaintenanceDetails() {
    const carId = getUrlParam('id');
    if (!carId) {
        window.location.href = '/';
        return;
    }

    try {
        const car = await api.get(`/api/cars/${carId}`);
        document.getElementById('car-name-breadcrumb').textContent = car.name;
        document.getElementById('car-name-title').textContent = car.name;

        // Load maintenance for this car
        loadMaintenance(carId);
    } catch (error) {
        console.error('Error loading car:', error);
        alert('Car not found');
        window.location.href = '/';
    }
}

async function loadMaintenance(carId) {
    const maintenanceContainer = document.getElementById('maintenance-list');
    if (!maintenanceContainer) return;

    try {
        const maintenance = await api.get(`/api/maintenance?carId=${carId}`);

        if (maintenance.length === 0) {
            maintenanceContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No maintenance records yet</h3>
                    <p>Add your first maintenance record for this car</p>
                </div>
            `;
            return;
        }

        // Sort by date descending (most recent first)
        maintenance.sort((a, b) => new Date(b.date) - new Date(a.date));

        maintenanceContainer.innerHTML = maintenance.map(task => {
            const costDisplay = task.cost ? `$${parseFloat(task.cost).toFixed(2)}` : '';
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <h3>${escapeHtml(task.name)}</h3>
                        <p>${formatDate(task.date)}${task.type ? ' - ' + escapeHtml(task.type) : ''}${costDisplay ? ' - ' + costDisplay : ''}</p>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-primary btn-sm" onclick="viewMaintenance('${task.id}')">View</button>
                        <button class="btn btn-secondary btn-sm" onclick="editMaintenance('${task.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteMaintenance('${task.id}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading maintenance:', error);
        maintenanceContainer.innerHTML = '<p class="text-center text-muted">Error loading maintenance records</p>';
    }
}

function showAddMaintenanceModal() {
    const form = document.getElementById('maintenance-form');
    form.reset();
    delete form.dataset.maintenanceId;
    document.getElementById('maintenance-modal-title').textContent = 'Add Maintenance';

    // Set today's date
    form.maintenanceDate.value = new Date().toISOString().split('T')[0];

    openModal('maintenance-modal');
}

async function saveMaintenance(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.maintenanceId;
    const carId = getUrlParam('id');

    const maintenanceData = {
        carId: carId,
        date: form.maintenanceDate.value,
        type: form.maintenanceType.value,
        name: form.maintenanceName.value,
        description: form.maintenanceDescription.value,
        cost: parseFloat(form.maintenanceCost.value) || 0,
        mileage: form.maintenanceMileage.value,
        partsUsed: form.maintenancePartsUsed.value,
        notes: form.maintenanceNotes.value
    };

    try {
        if (id) {
            await api.put(`/api/maintenance/${id}`, maintenanceData);
        } else {
            await api.post('/api/maintenance', maintenanceData);
        }
        closeModal('maintenance-modal');
        form.reset();
        delete form.dataset.maintenanceId;
        loadMaintenance(carId);
    } catch (error) {
        console.error('Error saving maintenance:', error);
        alert('Error saving maintenance');
    }
}

async function editMaintenance(id) {
    try {
        const task = await api.get(`/api/maintenance/${id}`);
        const form = document.getElementById('maintenance-form');

        form.maintenanceName.value = task.name || '';
        form.maintenanceDate.value = task.date || '';
        form.maintenanceType.value = task.type || '';
        form.maintenanceCost.value = task.cost || '';
        form.maintenanceMileage.value = task.mileage || '';
        form.maintenanceDescription.value = task.description || '';
        form.maintenancePartsUsed.value = task.partsUsed || '';
        form.maintenanceNotes.value = task.notes || '';

        form.dataset.maintenanceId = id;
        document.getElementById('maintenance-modal-title').textContent = 'Edit Maintenance';
        openModal('maintenance-modal');
    } catch (error) {
        console.error('Error loading maintenance:', error);
        alert('Error loading maintenance');
    }
}

async function viewMaintenance(id) {
    try {
        const task = await api.get(`/api/maintenance/${id}`);

        const detailsHtml = `
            <div class="setup-details">
                <div class="detail-group">
                    <h4>General</h4>
                    <div class="detail-row">
                        <span class="detail-label">Date</span>
                        <span class="detail-value">${formatDate(task.date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Type</span>
                        <span class="detail-value">${escapeHtml(task.type) || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Cost</span>
                        <span class="detail-value">${task.cost ? '$' + parseFloat(task.cost).toFixed(2) : '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Mileage / Hours</span>
                        <span class="detail-value">${escapeHtml(task.mileage) || '-'}</span>
                    </div>
                </div>

                ${task.description ? `
                    <div class="detail-group">
                        <h4>Description</h4>
                        <p>${escapeHtml(task.description).replace(/\n/g, '<br>')}</p>
                    </div>
                ` : ''}

                ${task.partsUsed ? `
                    <div class="detail-group">
                        <h4>Parts Used</h4>
                        <p>${escapeHtml(task.partsUsed).replace(/\n/g, '<br>')}</p>
                    </div>
                ` : ''}

                ${task.notes ? `
                    <div class="detail-group">
                        <h4>Notes</h4>
                        <p>${escapeHtml(task.notes).replace(/\n/g, '<br>')}</p>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('maintenance-view-title').textContent = task.name;
        document.getElementById('maintenance-view-content').innerHTML = detailsHtml;
        openModal('maintenance-view-modal');
    } catch (error) {
        console.error('Error loading maintenance:', error);
        alert('Error loading maintenance');
    }
}

async function deleteMaintenance(id) {
    if (!confirm('Are you sure you want to delete this maintenance record?')) {
        return;
    }

    try {
        await api.delete(`/api/maintenance/${id}`);
        loadMaintenance(getUrlParam('id'));
    } catch (error) {
        console.error('Error deleting maintenance:', error);
        alert('Error deleting maintenance');
    }
}

// ============ TRACKS PAGE ============

async function loadTracks() {
    const tracksContainer = document.getElementById('tracks-list');
    if (!tracksContainer) return;

    try {
        const tracks = await api.get('/api/tracks');

        if (tracks.length === 0) {
            tracksContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No tracks yet</h3>
                    <p>Add your first track to get started</p>
                </div>
            `;
            return;
        }

        tracksContainer.innerHTML = tracks.map(track => `
            <div class="list-item">
                <div class="list-item-content">
                    <h3>${escapeHtml(track.name)}</h3>
                    <p>${escapeHtml(track.location || '')}${track.length ? ' - ' + escapeHtml(track.length) : ''}</p>
                </div>
                <div class="list-item-actions">
                    <a href="track.html?id=${track.id}" class="btn btn-primary btn-sm">View</a>
                    <a href="session-notes.html?id=${track.id}" class="btn btn-primary btn-sm">Session Notes</a>
                    <button class="btn btn-secondary btn-sm" onclick="editTrack('${track.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTrack('${track.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading tracks:', error);
        tracksContainer.innerHTML = '<p class="text-center text-muted">Error loading tracks</p>';
    }
}

async function saveTrack(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.trackId;

    // Parse corners from textarea (one per line)
    const cornersText = form.trackCorners.value;
    const corners = cornersText
        .split('\n')
        .map(c => c.trim())
        .filter(c => c.length > 0);

    const trackData = {
        name: form.trackName.value,
        location: form.trackLocation.value,
        length: form.trackLength.value,
        imageUrl: form.trackImageUrl.value,
        corners: corners
    };

    try {
        if (id) {
            await api.put(`/api/tracks/${id}`, trackData);
        } else {
            await api.post('/api/tracks', trackData);
        }
        closeModal('track-modal');
        form.reset();
        delete form.dataset.trackId;
        loadTracks();
    } catch (error) {
        console.error('Error saving track:', error);
        alert('Error saving track');
    }
}

async function editTrack(id) {
    try {
        const track = await api.get(`/api/tracks/${id}`);
        const form = document.getElementById('track-form');
        form.trackName.value = track.name;
        form.trackLocation.value = track.location;
        form.trackLength.value = track.length;
        form.trackImageUrl.value = track.imageUrl || '';
        form.trackCorners.value = (track.corners || []).join('\n');
        form.dataset.trackId = id;
        document.getElementById('track-modal-title').textContent = 'Edit Track';
        openModal('track-modal');
    } catch (error) {
        console.error('Error loading track:', error);
        alert('Error loading track');
    }
}

async function deleteTrack(id) {
    if (!confirm('Are you sure you want to delete this track? All related track notes will also be deleted.')) {
        return;
    }

    try {
        await api.delete(`/api/tracks/${id}`);
        loadTracks();
    } catch (error) {
        console.error('Error deleting track:', error);
        alert('Error deleting track');
    }
}

function showAddTrackModal() {
    const form = document.getElementById('track-form');
    form.reset();
    delete form.dataset.trackId;
    document.getElementById('track-modal-title').textContent = 'Add Track';
    openModal('track-modal');
}

// ============ SINGLE TRACK PAGE ============

async function loadTrackDetails() {
    const trackId = getUrlParam('id');
    if (!trackId) {
        window.location.href = '/tracks.html';
        return;
    }

    try {
        const track = await api.get(`/api/tracks/${trackId}`);
        document.getElementById('track-name-breadcrumb').textContent = track.name;
        document.getElementById('track-name-title').textContent = track.name;
        document.getElementById('track-location').textContent = track.location || 'No location';
        document.getElementById('track-length').textContent = track.length || '-';

        // Display track image if available
        const trackImageContainer = document.getElementById('track-image-container');
        if (trackImageContainer && track.imageUrl) {
            const img = document.createElement('img');
            img.src = track.imageUrl;
            img.alt = track.name + ' layout';
            img.className = 'track-layout-image';
            img.onerror = function() {
                trackImageContainer.style.display = 'none';
            };
            trackImageContainer.innerHTML = '';
            trackImageContainer.appendChild(img);
            trackImageContainer.style.display = 'block';
        } else if (trackImageContainer) {
            trackImageContainer.style.display = 'none';
        }

        // Set session notes link
        const sessionNotesLink = document.getElementById('session-notes-link');
        if (sessionNotesLink) {
            sessionNotesLink.href = `session-notes.html?id=${trackId}`;
        }

        // Load track notes
        loadTrackNotes(trackId);
    } catch (error) {
        console.error('Error loading track:', error);
        alert('Track not found');
        window.location.href = '/tracks.html';
    }
}

async function loadCornerNotesCars() {
    const select = document.getElementById('cornerNotesCar');
    if (!select) return;

    try {
        const cars = await api.get('/api/cars');
        select.innerHTML = '<option value="">Select a car...</option>' +
            cars.map(car => `<option value="${car.id}">${escapeHtml(car.name)}</option>`).join('');
    } catch (error) {
        console.error('Error loading cars for corner notes:', error);
    }
}

function onCornerNotesCarChange() {
    const select = document.getElementById('cornerNotesCar');
    const carId = select ? select.value : '';
    const track = window.currentTrack;

    if (!track) return;

    if (!carId) {
        const container = document.getElementById('corner-notes-container');
        if (container) {
            container.innerHTML = '<p class="corner-notes-empty">Select a car to view and edit corner notes</p>';
        }
        return;
    }

    loadCornerNotes(track.id, track.corners || [], carId);
}

async function loadCornerNotes(trackId, corners, carId) {
    const container = document.getElementById('corner-notes-container');
    if (!container) return;

    if (!corners || corners.length === 0) {
        container.innerHTML = '<p class="corner-notes-empty">No corners defined for this track. Edit the track to add corners.</p>';
        return;
    }

    if (!carId) {
        container.innerHTML = '<p class="corner-notes-empty">Select a car to view and edit corner notes</p>';
        return;
    }

    try {
        const cornerNotes = await api.get(`/api/corner-notes?trackId=${trackId}&carId=${carId}`);
        const notesMap = {};
        cornerNotes.forEach(cn => {
            notesMap[cn.cornerName] = {
                entry: cn.entry || '',
                apex: cn.apex || '',
                exit: cn.exit || ''
            };
        });

        container.innerHTML = corners.map((cornerName, index) => {
            const cornerNum = index + 1;
            const safeId = cornerName.replace(/[^a-zA-Z0-9]/g, '-');
            const notes = notesMap[cornerName] || { entry: '', apex: '', exit: '' };
            // Remove any leading numbers from corner name for display
            const displayName = cornerName.replace(/^\d+\s*/, '');

            return `
                <div class="corner-note-card">
                    <div class="corner-note-header">
                        <span class="corner-number">${cornerNum}</span>
                        <h4>${escapeHtml(displayName)}</h4>
                    </div>
                    <div class="corner-note-fields">
                        <div class="corner-note-field">
                            <label>Entry</label>
                            <textarea
                                data-track-id="${trackId}"
                                data-car-id="${carId}"
                                data-corner-name="${escapeHtml(cornerName)}"
                                data-field="entry"
                                placeholder="Entry notes..."
                                onblur="saveCornerNote(this)"
                            >${escapeHtml(notes.entry)}</textarea>
                        </div>
                        <div class="corner-note-field">
                            <label>Apex</label>
                            <textarea
                                data-track-id="${trackId}"
                                data-car-id="${carId}"
                                data-corner-name="${escapeHtml(cornerName)}"
                                data-field="apex"
                                placeholder="Apex notes..."
                                onblur="saveCornerNote(this)"
                            >${escapeHtml(notes.apex)}</textarea>
                        </div>
                        <div class="corner-note-field">
                            <label>Exit</label>
                            <textarea
                                data-track-id="${trackId}"
                                data-car-id="${carId}"
                                data-corner-name="${escapeHtml(cornerName)}"
                                data-field="exit"
                                placeholder="Exit notes..."
                                onblur="saveCornerNote(this)"
                            >${escapeHtml(notes.exit)}</textarea>
                        </div>
                    </div>
                    <div class="save-status" id="status-${safeId}"></div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading corner notes:', error);
        container.innerHTML = '<p class="corner-notes-empty">Error loading corner notes</p>';
    }
}

async function saveCornerNote(textarea) {
    const trackId = textarea.dataset.trackId;
    const carId = textarea.dataset.carId;
    const cornerName = textarea.dataset.cornerName;
    const field = textarea.dataset.field;
    const value = textarea.value;
    const safeId = cornerName.replace(/[^a-zA-Z0-9]/g, '-');
    const statusEl = document.getElementById('status-' + safeId);

    if (statusEl) {
        statusEl.textContent = 'Saving...';
        statusEl.className = 'save-status';
    }

    try {
        await api.post('/api/corner-notes', {
            trackId: trackId,
            carId: carId,
            cornerName: cornerName,
            field: field,
            value: value
        });
        if (statusEl) {
            statusEl.textContent = 'Saved';
            statusEl.className = 'save-status saved';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving corner note:', error);
        if (statusEl) {
            statusEl.textContent = 'Error saving';
            statusEl.className = 'save-status';
        }
    }
}

async function loadTrackNotes(trackId) {
    const notesContainer = document.getElementById('track-notes-list');
    if (!notesContainer) return;

    try {
        const [trackNotes, cars] = await Promise.all([
            api.get(`/api/track-notes?trackId=${trackId}`),
            api.get('/api/cars')
        ]);

        const carsMap = {};
        cars.forEach(c => carsMap[c.id] = c);

        if (trackNotes.length === 0) {
            notesContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No notes yet</h3>
                    <p>Add car-specific notes for this track</p>
                </div>
            `;
            return;
        }

        notesContainer.innerHTML = trackNotes.map(note => {
            const car = note.carId ? carsMap[note.carId] : null;
            return `
                <div class="list-item" style="flex-direction: column; align-items: flex-start;">
                    <div class="list-item-content" style="width: 100%;">
                        <h3>${car ? escapeHtml(car.name) : 'Unknown Car'}</h3>
                        <p class="mt-2">${escapeHtml(note.notes).replace(/\n/g, '<br>')}</p>
                    </div>
                    <div class="list-item-actions mt-3">
                        <button class="btn btn-secondary btn-sm" onclick="editTrackNote('${note.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteTrackNote('${note.id}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading track notes:', error);
        notesContainer.innerHTML = '<p class="text-center text-muted">Error loading track notes</p>';
    }
}

async function showAddTrackNoteModal() {
    const form = document.getElementById('track-note-form');
    form.reset();
    delete form.dataset.noteId;
    document.getElementById('track-note-modal-title').textContent = 'Add Track Note';

    // Load cars for dropdown
    await loadCarDropdown('noteCar');

    openModal('track-note-modal');
}

async function loadCarDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const cars = await api.get('/api/cars');
        select.innerHTML = '<option value="">Select a car</option>' +
            cars.map(car => `<option value="${car.id}">${escapeHtml(car.name)}</option>`).join('');
    } catch (error) {
        console.error('Error loading cars:', error);
    }
}

async function saveTrackNote(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.noteId;
    const trackId = getUrlParam('id');

    const noteData = {
        carId: form.noteCar.value || null,
        trackId: trackId,
        notes: form.noteText.value
    };

    try {
        if (id) {
            await api.put(`/api/track-notes/${id}`, noteData);
        } else {
            await api.post('/api/track-notes', noteData);
        }
        closeModal('track-note-modal');
        form.reset();
        delete form.dataset.noteId;
        loadTrackNotes(trackId);
    } catch (error) {
        console.error('Error saving track note:', error);
        alert('Error saving track note');
    }
}

async function editTrackNote(id) {
    try {
        const note = await api.get(`/api/track-notes/${id}`);
        const form = document.getElementById('track-note-form');

        await loadCarDropdown('noteCar');

        form.noteCar.value = note.carId || '';
        form.noteText.value = note.notes;
        form.dataset.noteId = id;
        document.getElementById('track-note-modal-title').textContent = 'Edit Track Note';
        openModal('track-note-modal');
    } catch (error) {
        console.error('Error loading track note:', error);
        alert('Error loading track note');
    }
}

async function deleteTrackNote(id) {
    if (!confirm('Are you sure you want to delete this track note?')) {
        return;
    }

    try {
        await api.delete(`/api/track-notes/${id}`);
        loadTrackNotes(getUrlParam('id'));
    } catch (error) {
        console.error('Error deleting track note:', error);
        alert('Error deleting track note');
    }
}

// ============ SESSION NOTES PAGE ============

async function loadSessionNotesDetails() {
    const trackId = getUrlParam('id');
    if (!trackId) {
        window.location.href = '/tracks.html';
        return;
    }

    try {
        const track = await api.get(`/api/tracks/${trackId}`);

        // Update breadcrumb link
        const trackLink = document.getElementById('track-link');
        if (trackLink) {
            trackLink.href = `track.html?id=${trackId}`;
            trackLink.textContent = track.name;
        }

        document.getElementById('track-name-title').textContent = track.name;

        // Display track image if available
        const trackImageContainer = document.getElementById('track-image-container');
        if (trackImageContainer && track.imageUrl) {
            const img = document.createElement('img');
            img.src = track.imageUrl;
            img.alt = track.name + ' layout';
            img.className = 'track-layout-image';
            img.onerror = function() {
                trackImageContainer.style.display = 'none';
            };
            trackImageContainer.innerHTML = '';
            trackImageContainer.appendChild(img);
            trackImageContainer.style.display = 'block';
        } else if (trackImageContainer) {
            trackImageContainer.style.display = 'none';
        }

        // Store track data
        window.currentTrack = track;
        window.currentSession = null;

        // Load cars dropdown
        await loadSessionNotesCars();

        // Setup form event listener for session car setup
        const sessionSetupForm = document.getElementById('session-setup-form');
        if (sessionSetupForm) {
            sessionSetupForm.addEventListener('submit', saveSessionSetup);
        }
    } catch (error) {
        console.error('Error loading track:', error);
        alert('Track not found');
        window.location.href = '/tracks.html';
    }
}

async function loadSessionNotesCars() {
    const select = document.getElementById('sessionNotesCar');
    if (!select) return;

    try {
        const cars = await api.get('/api/cars');
        select.innerHTML = '<option value="">Select a car...</option>' +
            cars.map(car => {
                const label = car.series ? `${car.name} (${car.series})` : car.name;
                return `<option value="${car.id}">${escapeHtml(label)}</option>`;
            }).join('');
    } catch (error) {
        console.error('Error loading cars:', error);
    }
}

async function onSessionNotesCarChange() {
    const select = document.getElementById('sessionNotesCar');
    const carId = select ? select.value : '';
    const track = window.currentTrack;

    // Hide session selector, session setup, corner notes, and focus areas if no car selected
    const sessionContainer = document.getElementById('session-selector-container');
    const cornerNotesSection = document.getElementById('corner-notes-section');
    const sessionSetupSection = document.getElementById('session-setup-section');
    const focusAreasSection = document.getElementById('focus-areas-section');
    const sessionInfo = document.getElementById('session-info');

    if (!carId || !track) {
        if (sessionContainer) sessionContainer.style.display = 'none';
        if (cornerNotesSection) cornerNotesSection.style.display = 'none';
        if (sessionSetupSection) sessionSetupSection.style.display = 'none';
        if (focusAreasSection) focusAreasSection.style.display = 'none';
        window.currentSession = null;
        return;
    }

    // Store current car
    window.currentCarId = carId;

    // Show session selector and load sessions
    if (sessionContainer) sessionContainer.style.display = 'block';
    if (sessionInfo) sessionInfo.style.display = 'none';
    if (cornerNotesSection) cornerNotesSection.style.display = 'none';
    if (sessionSetupSection) sessionSetupSection.style.display = 'none';
    if (focusAreasSection) focusAreasSection.style.display = 'none';

    await loadSessions(track.id, carId);
}

async function loadSessions(trackId, carId) {
    const select = document.getElementById('sessionSelect');
    if (!select) return;

    try {
        const sessions = await api.get(`/api/sessions?trackId=${trackId}&carId=${carId}`);

        // Sort by date descending
        sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

        select.innerHTML = '<option value="">Select a session...</option>' +
            sessions.map(session => {
                const dateStr = formatDate(session.date);
                return `<option value="${session.id}">${session.type} - ${dateStr}</option>`;
            }).join('');

        window.currentSession = null;
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

async function onSessionChange() {
    const select = document.getElementById('sessionSelect');
    const sessionId = select ? select.value : '';
    const track = window.currentTrack;

    const sessionInfo = document.getElementById('session-info');
    const cornerNotesSection = document.getElementById('corner-notes-section');
    const sessionSetupSection = document.getElementById('session-setup-section');
    const focusAreasSection = document.getElementById('focus-areas-section');

    if (!sessionId) {
        if (sessionInfo) sessionInfo.style.display = 'none';
        if (cornerNotesSection) cornerNotesSection.style.display = 'none';
        if (sessionSetupSection) sessionSetupSection.style.display = 'none';
        if (focusAreasSection) focusAreasSection.style.display = 'none';
        window.currentSession = null;
        return;
    }

    try {
        const session = await api.get(`/api/sessions/${sessionId}`);
        window.currentSession = session;

        // Display session info
        if (sessionInfo) {
            const typeBadge = document.getElementById('session-type-badge');
            const dateSpan = document.getElementById('session-date');
            const conditionsSpan = document.getElementById('session-conditions');

            if (typeBadge) {
                typeBadge.textContent = session.type;
                typeBadge.className = 'badge badge-' + session.type.toLowerCase();
            }
            if (dateSpan) dateSpan.textContent = formatDate(session.date);
            if (conditionsSpan) conditionsSpan.textContent = session.trackConditions ? `(${session.trackConditions})` : '';

            sessionInfo.style.display = 'flex';
        }

        // Show and load session setup
        if (sessionSetupSection) {
            sessionSetupSection.style.display = 'block';
            loadSessionSetup(session);
        }

        // Show and load corner notes
        if (cornerNotesSection) cornerNotesSection.style.display = 'block';
        loadCornerNotesForSession(session.id, track.corners || []);

        // Show and load focus areas
        if (focusAreasSection) {
            focusAreasSection.style.display = 'block';
            loadFocusAreas(session);
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
}

function showAddSessionModal() {
    const form = document.getElementById('session-form');
    form.reset();
    delete form.dataset.sessionId;
    document.getElementById('session-modal-title').textContent = 'Add Session';

    // Set today's date
    form.sessionDate.value = new Date().toISOString().split('T')[0];

    openModal('session-modal');
}

async function saveSession(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.sessionId;
    const trackId = getUrlParam('id');

    // Get carId from dropdown as fallback
    const carSelect = document.getElementById('sessionNotesCar');
    const carId = window.currentCarId || (carSelect ? carSelect.value : null);

    console.log('saveSession called', { id, trackId, carId });

    if (!carId || !trackId) {
        alert('Please select a car first');
        return;
    }

    const sessionData = {
        trackId: trackId,
        carId: carId,
        type: form.sessionType.value,
        date: form.sessionDate.value,
        trackConditions: form.sessionConditions.value
    };

    console.log('sessionData:', sessionData);

    try {
        let savedSession;
        if (id) {
            console.log('Updating session:', id);
            savedSession = await api.put(`/api/sessions/${id}`, sessionData);
        } else {
            console.log('Creating new session');
            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionData)
            });
            console.log('Response status:', response.status);
            if (!response.ok) {
                const text = await response.text();
                console.log('Response text:', text);
                throw new Error(`HTTP ${response.status}: ${text}`);
            }
            savedSession = await response.json();
        }
        console.log('Saved session:', savedSession);
        closeModal('session-modal');
        form.reset();
        delete form.dataset.sessionId;

        // Reload sessions and select the new/updated one
        await loadSessions(trackId, carId);
        document.getElementById('sessionSelect').value = savedSession.id;
        onSessionChange();
    } catch (error) {
        console.error('Error saving session:', error);
        alert('Error saving session: ' + error.message);
    }
}

async function editCurrentSession() {
    const session = window.currentSession;
    if (!session) return;

    const form = document.getElementById('session-form');
    form.sessionType.value = session.type || '';
    form.sessionDate.value = session.date || '';
    form.sessionConditions.value = session.trackConditions || '';
    form.dataset.sessionId = session.id;

    document.getElementById('session-modal-title').textContent = 'Edit Session';
    openModal('session-modal');
}

async function deleteCurrentSession() {
    const session = window.currentSession;
    if (!session) return;

    if (!confirm('Are you sure you want to delete this session? All corner notes for this session will also be deleted.')) {
        return;
    }

    try {
        await api.delete(`/api/sessions/${session.id}`);
        window.currentSession = null;

        // Reload sessions
        const trackId = getUrlParam('id');
        const carId = window.currentCarId;
        await loadSessions(trackId, carId);

        // Hide session info and corner notes
        document.getElementById('session-info').style.display = 'none';
        document.getElementById('corner-notes-section').style.display = 'none';
    } catch (error) {
        console.error('Error deleting session:', error);
        alert('Error deleting session');
    }
}

function loadSessionSetup(session) {
    const form = document.getElementById('session-setup-form');
    if (!form) return;

    // Populate tyre pressures
    form.sessionTpFL.value = session.tyrePressures?.fl || '';
    form.sessionTpFR.value = session.tyrePressures?.fr || '';
    form.sessionTpRL.value = session.tyrePressures?.rl || '';
    form.sessionTpRR.value = session.tyrePressures?.rr || '';

    // Populate ARB and brake bias
    form.sessionFrontARB.value = session.frontARB || '';
    form.sessionRearARB.value = session.rearARB || '';
    form.sessionBrakeBias.value = session.brakeBias || '';

    // Populate comments
    form.sessionSetupComments.value = session.setupComments || '';
}

async function saveSessionSetup(event) {
    event.preventDefault();
    const session = window.currentSession;
    if (!session) {
        alert('No session selected');
        return;
    }

    const form = event.target;
    const statusEl = document.getElementById('session-setup-status');

    if (statusEl) {
        statusEl.textContent = 'Saving...';
        statusEl.className = 'save-status';
    }

    const setupData = {
        tyrePressures: {
            fl: parseFloat(form.sessionTpFL.value) || null,
            fr: parseFloat(form.sessionTpFR.value) || null,
            rl: parseFloat(form.sessionTpRL.value) || null,
            rr: parseFloat(form.sessionTpRR.value) || null
        },
        frontARB: form.sessionFrontARB.value,
        rearARB: form.sessionRearARB.value,
        brakeBias: form.sessionBrakeBias.value,
        setupComments: form.sessionSetupComments.value
    };

    try {
        const updatedSession = await api.put(`/api/sessions/${session.id}`, setupData);
        window.currentSession = updatedSession;

        if (statusEl) {
            statusEl.textContent = 'Saved';
            statusEl.className = 'save-status saved';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving session setup:', error);
        if (statusEl) {
            statusEl.textContent = 'Error saving';
            statusEl.className = 'save-status';
        }
    }
}

function loadFocusAreas(session) {
    const textarea = document.getElementById('focusAreas');
    if (textarea) {
        textarea.value = session.focusAreas || '';
    }
}

async function saveFocusAreas() {
    const session = window.currentSession;
    if (!session) {
        alert('No session selected');
        return;
    }

    const textarea = document.getElementById('focusAreas');
    const statusEl = document.getElementById('focus-areas-status');

    if (statusEl) {
        statusEl.textContent = 'Saving...';
        statusEl.className = 'save-status';
    }

    try {
        const updatedSession = await api.put(`/api/sessions/${session.id}`, {
            focusAreas: textarea.value
        });
        window.currentSession = updatedSession;

        if (statusEl) {
            statusEl.textContent = 'Saved';
            statusEl.className = 'save-status saved';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving focus areas:', error);
        if (statusEl) {
            statusEl.textContent = 'Error saving';
            statusEl.className = 'save-status';
        }
    }
}

async function showImportSetupModal() {
    const carId = window.currentCarId;
    if (!carId) {
        alert('No car selected');
        return;
    }

    const select = document.getElementById('importSetupSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Loading setups...</option>';
    openModal('import-setup-modal');

    try {
        const setups = await api.get(`/api/setups?carId=${carId}`);

        if (setups.length === 0) {
            select.innerHTML = '<option value="">No setups found for this car</option>';
            return;
        }

        select.innerHTML = '<option value="">Select a setup...</option>' +
            setups.map(setup => {
                const label = setup.name + (setup.trackId ? '' : ' (General)');
                return `<option value="${setup.id}">${escapeHtml(label)}</option>`;
            }).join('');

        // Store setups for later use
        window.availableSetups = setups;
    } catch (error) {
        console.error('Error loading setups:', error);
        select.innerHTML = '<option value="">Error loading setups</option>';
    }
}

async function importSelectedSetup() {
    const select = document.getElementById('importSetupSelect');
    const setupId = select ? select.value : '';

    if (!setupId) {
        alert('Please select a setup to import');
        return;
    }

    const setup = window.availableSetups?.find(s => s.id === setupId);
    if (!setup) {
        alert('Setup not found');
        return;
    }

    const form = document.getElementById('session-setup-form');
    if (!form) return;

    // Populate tyre pressures
    form.sessionTpFL.value = setup.tyrePressures?.fl || '';
    form.sessionTpFR.value = setup.tyrePressures?.fr || '';
    form.sessionTpRL.value = setup.tyrePressures?.rl || '';
    form.sessionTpRR.value = setup.tyrePressures?.rr || '';

    // Populate ARB values
    form.sessionFrontARB.value = setup.antiRollBarFront || '';
    form.sessionRearARB.value = setup.antiRollBarRear || '';
    // Note: Brake bias and comments are not imported - they're session-specific

    closeModal('import-setup-modal');

    // Show status
    const statusEl = document.getElementById('session-setup-status');
    if (statusEl) {
        statusEl.textContent = 'Imported - click Save to keep changes';
        statusEl.className = 'save-status';
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
    }
}

async function loadCornerNotesForSession(sessionId, corners) {
    const container = document.getElementById('corner-notes-container');
    if (!container) return;

    if (!corners || corners.length === 0) {
        container.innerHTML = '<p class="corner-notes-empty">No corners defined for this track. Edit the track to add corners.</p>';
        return;
    }

    try {
        const cornerNotes = await api.get(`/api/corner-notes?sessionId=${sessionId}`);
        const notesMap = {};
        cornerNotes.forEach(cn => {
            notesMap[cn.cornerName] = {
                entry: cn.entry || '',
                apex: cn.apex || '',
                exit: cn.exit || ''
            };
        });

        container.innerHTML = corners.map((cornerName, index) => {
            const cornerNum = index + 1;
            const safeId = cornerName.replace(/[^a-zA-Z0-9]/g, '-');
            const notes = notesMap[cornerName] || { entry: '', apex: '', exit: '' };
            const displayName = cornerName.replace(/^\d+\s*/, '');

            return `
                <div class="corner-note-card">
                    <div class="corner-note-header">
                        <span class="corner-number">${cornerNum}</span>
                        <h4>${escapeHtml(displayName)}</h4>
                    </div>
                    <div class="corner-note-fields">
                        <div class="corner-note-field">
                            <label>Entry</label>
                            <textarea
                                data-session-id="${sessionId}"
                                data-corner-name="${escapeHtml(cornerName)}"
                                data-field="entry"
                                placeholder="Entry notes..."
                                onblur="saveCornerNoteForSession(this)"
                            >${escapeHtml(notes.entry)}</textarea>
                        </div>
                        <div class="corner-note-field">
                            <label>Apex</label>
                            <textarea
                                data-session-id="${sessionId}"
                                data-corner-name="${escapeHtml(cornerName)}"
                                data-field="apex"
                                placeholder="Apex notes..."
                                onblur="saveCornerNoteForSession(this)"
                            >${escapeHtml(notes.apex)}</textarea>
                        </div>
                        <div class="corner-note-field">
                            <label>Exit</label>
                            <textarea
                                data-session-id="${sessionId}"
                                data-corner-name="${escapeHtml(cornerName)}"
                                data-field="exit"
                                placeholder="Exit notes..."
                                onblur="saveCornerNoteForSession(this)"
                            >${escapeHtml(notes.exit)}</textarea>
                        </div>
                    </div>
                    <div class="save-status" id="status-${safeId}"></div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading corner notes:', error);
        container.innerHTML = '<p class="corner-notes-empty">Error loading corner notes</p>';
    }
}

async function saveCornerNoteForSession(textarea) {
    const sessionId = textarea.dataset.sessionId;
    const cornerName = textarea.dataset.cornerName;
    const field = textarea.dataset.field;
    const value = textarea.value;
    const safeId = cornerName.replace(/[^a-zA-Z0-9]/g, '-');
    const statusEl = document.getElementById('status-' + safeId);

    if (statusEl) {
        statusEl.textContent = 'Saving...';
        statusEl.className = 'save-status';
    }

    try {
        await api.post('/api/corner-notes', {
            sessionId: sessionId,
            cornerName: cornerName,
            field: field,
            value: value
        });
        if (statusEl) {
            statusEl.textContent = 'Saved';
            statusEl.className = 'save-status saved';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving corner note:', error);
        if (statusEl) {
            statusEl.textContent = 'Error saving';
            statusEl.className = 'save-status';
        }
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize based on current page
document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;

    // Check authentication first
    const username = await checkAuth();
    if (!username) return; // Will redirect to login

    // Update user display
    updateUserDisplay(username);

    if (path === '/' || path === '/index.html') {
        loadCars();
    } else if (path === '/car.html') {
        loadCarDetails();
    } else if (path === '/maintenance.html') {
        loadMaintenanceDetails();
    } else if (path === '/tracks.html') {
        loadTracks();
    } else if (path === '/track.html') {
        loadTrackDetails();
    } else if (path === '/session-notes.html') {
        loadSessionNotesDetails();
    }
});
