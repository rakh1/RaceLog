const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

const app = express();
const PORT = 3000;

// Detect if running as packaged executable
const isPackaged = typeof process.pkg !== 'undefined';
const basePath = isPackaged ? path.dirname(process.execPath) : __dirname;
const publicPath = isPackaged ? path.join(__dirname, 'public') : path.join(__dirname, 'public');

// Data directory (always next to the executable or script, writable location)
// Support environment variable for testing
const DATA_DIR = process.env.RACELOG_DATA_DIR || path.join(basePath, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DEFAULT_DATA_DIR = isPackaged ? path.join(__dirname, 'default-data') : path.join(__dirname, 'default-data');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR);
}

// Track images directory (in DATA_DIR so it's writable even when packaged)
const TRACK_IMAGES_DIR = path.join(DATA_DIR, 'track-images');
if (!fs.existsSync(TRACK_IMAGES_DIR)) {
    fs.mkdirSync(TRACK_IMAGES_DIR);
}

// Migrate track images from old public/images/tracks/ to data/track-images/
const oldTrackImagesDir = path.join(publicPath, 'images', 'tracks');
if (fs.existsSync(oldTrackImagesDir)) {
    try {
        const oldFiles = fs.readdirSync(oldTrackImagesDir);
        for (const file of oldFiles) {
            const oldPath = path.join(oldTrackImagesDir, file);
            const newPath = path.join(TRACK_IMAGES_DIR, file);
            if (!fs.existsSync(newPath) && fs.statSync(oldPath).isFile()) {
                fs.copyFileSync(oldPath, newPath);
            }
        }
    } catch (err) {
        // Ignore migration errors (e.g. read-only snapshot in packaged app)
    }
}

// Download image from URL and save locally
async function downloadTrackImage(imageUrl, trackId) {
    return new Promise((resolve, reject) => {
        if (!imageUrl || imageUrl.startsWith('/images/')) {
            // Already local or empty
            resolve(imageUrl);
            return;
        }

        // Determine file extension from URL
        const urlPath = new URL(imageUrl).pathname;
        let ext = path.extname(urlPath).toLowerCase();
        if (!ext || !['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
            ext = '.png'; // Default to png
        }

        const filename = `${trackId}${ext}`;
        const localPath = path.join(TRACK_IMAGES_DIR, filename);
        const localUrl = `/images/tracks/${filename}`;

        const protocol = imageUrl.startsWith('https') ? https : http;

        const request = protocol.get(imageUrl, {
            headers: { 'User-Agent': 'RaceLog/1.0' }
        }, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadTrackImage(response.headers.location, trackId)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(localPath);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve(localUrl);
            });

            file.on('error', (err) => {
                fs.unlink(localPath, () => {}); // Delete partial file
                reject(err);
            });
        });

        request.on('error', (err) => {
            reject(err);
        });

        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

// Middleware
app.use(express.json({ limit: '50mb' }));

// Session middleware
app.use(session({
    store: new FileStore({
        path: SESSIONS_DIR,
        ttl: 86400 * 7 // 7 days
    }),
    secret: 'racelog-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 86400 * 7 * 1000 // 7 days
    }
}));

// Serve track images from writable data directory
app.use('/images/tracks', express.static(TRACK_IMAGES_DIR));
app.use(express.static(publicPath));

// Helper functions for JSON file operations
function readJsonFile(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
        // Check for default data
        const defaultPath = path.join(DEFAULT_DATA_DIR, filename);
        if (fs.existsSync(defaultPath)) {
            const defaultData = fs.readFileSync(defaultPath, 'utf8');
            fs.writeFileSync(filepath, defaultData);
            return JSON.parse(defaultData);
        }
        fs.writeFileSync(filepath, '[]');
        return [];
    }
    const data = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(data);
}

function writeJsonFile(filename, data) {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Auth middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// ============ AUTH API ============

// POST register
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const users = readJsonFile('users.json');
    const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = {
            id: uuidv4(),
            username: username,
            passwordHash: passwordHash,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        writeJsonFile('users.json', users);

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Error registering user' });
    }
});

// POST login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const users = readJsonFile('users.json');
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    try {
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({ message: 'Login successful', username: user.username });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: 'Error logging in' });
    }
});

// POST logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).json({ error: 'Error logging out' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

// GET auth check
app.get('/api/auth/check', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ authenticated: true, username: req.session.username });
    } else {
        res.json({ authenticated: false });
    }
});

// ============ USER ACCOUNT API ============

// PUT update username
app.put('/api/user/username', requireAuth, async (req, res) => {
    const { username } = req.body;

    if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    const users = readJsonFile('users.json');
    const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== req.session.userId);

    if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const userIndex = users.findIndex(u => u.id === req.session.userId);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].username = username;
    writeJsonFile('users.json', users);

    req.session.username = username;
    res.json({ message: 'Username updated successfully', username: username });
});

// PUT change password
app.put('/api/user/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const users = readJsonFile('users.json');
    const user = users.find(u => u.id === req.session.userId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    try {
        const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        const userIndex = users.findIndex(u => u.id === req.session.userId);
        users[userIndex].passwordHash = newPasswordHash;
        writeJsonFile('users.json', users);

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Error changing password' });
    }
});

// DELETE user account
app.delete('/api/user', requireAuth, async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required to delete account' });
    }

    const users = readJsonFile('users.json');
    const user = users.find(u => u.id === req.session.userId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    try {
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Password is incorrect' });
        }

        const userId = req.session.userId;

        // Delete all user data
        const cars = readJsonFile('cars.json').filter(c => c.userId !== userId);
        writeJsonFile('cars.json', cars);

        const setups = readJsonFile('setups.json').filter(s => s.userId !== userId);
        writeJsonFile('setups.json', setups);

        const tracks = readJsonFile('tracks.json').filter(t => t.userId !== userId);
        writeJsonFile('tracks.json', tracks);

        const sessions = readJsonFile('sessions.json').filter(s => s.userId !== userId);
        writeJsonFile('sessions.json', sessions);

        const cornerNotes = readJsonFile('corner-notes.json').filter(cn => cn.userId !== userId);
        writeJsonFile('corner-notes.json', cornerNotes);

        const trackNotes = readJsonFile('track-notes.json').filter(tn => tn.userId !== userId);
        writeJsonFile('track-notes.json', trackNotes);

        const maintenance = readJsonFile('maintenance.json').filter(m => m.userId !== userId);
        writeJsonFile('maintenance.json', maintenance);

        // Delete user
        const updatedUsers = users.filter(u => u.id !== userId);
        writeJsonFile('users.json', updatedUsers);

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            res.json({ message: 'Account deleted successfully' });
        });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Error deleting account' });
    }
});

// ============ CARS API ============

// GET all cars (user's cars only)
app.get('/api/cars', requireAuth, (req, res) => {
    const cars = readJsonFile('cars.json');
    const userCars = cars.filter(c => c.userId === req.session.userId);
    res.json(userCars);
});

// GET single car (user's car only)
app.get('/api/cars/:id', requireAuth, (req, res) => {
    const cars = readJsonFile('cars.json');
    const car = cars.find(c => c.id === req.params.id && c.userId === req.session.userId);
    if (!car) {
        return res.status(404).json({ error: 'Car not found' });
    }
    res.json(car);
});

// POST create car
app.post('/api/cars', requireAuth, (req, res) => {
    const cars = readJsonFile('cars.json');
    const newCar = {
        id: uuidv4(),
        userId: req.session.userId,
        name: req.body.name || '',
        manufacturer: req.body.manufacturer || '',
        series: req.body.series || ''
    };
    cars.push(newCar);
    writeJsonFile('cars.json', cars);
    res.status(201).json(newCar);
});

// PUT update car (user's car only)
app.put('/api/cars/:id', requireAuth, (req, res) => {
    const cars = readJsonFile('cars.json');
    const index = cars.findIndex(c => c.id === req.params.id && c.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Car not found' });
    }
    cars[index] = {
        ...cars[index],
        name: req.body.name ?? cars[index].name,
        manufacturer: req.body.manufacturer ?? cars[index].manufacturer,
        series: req.body.series ?? cars[index].series
    };
    writeJsonFile('cars.json', cars);
    res.json(cars[index]);
});

// DELETE car (user's car only)
app.delete('/api/cars/:id', requireAuth, (req, res) => {
    let cars = readJsonFile('cars.json');
    const index = cars.findIndex(c => c.id === req.params.id && c.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Car not found' });
    }
    cars.splice(index, 1);
    writeJsonFile('cars.json', cars);

    // Also delete related setups, track notes, and maintenance tasks (only user's)
    let setups = readJsonFile('setups.json');
    setups = setups.filter(s => !(s.carId === req.params.id && s.userId === req.session.userId));
    writeJsonFile('setups.json', setups);

    let trackNotes = readJsonFile('track-notes.json');
    trackNotes = trackNotes.filter(tn => !(tn.carId === req.params.id && tn.userId === req.session.userId));
    writeJsonFile('track-notes.json', trackNotes);

    let maintenance = readJsonFile('maintenance.json');
    maintenance = maintenance.filter(m => !(m.carId === req.params.id && m.userId === req.session.userId));
    writeJsonFile('maintenance.json', maintenance);

    res.status(204).send();
});

// ============ SETUPS API ============

// GET all setups (user's setups only, with optional carId filter)
app.get('/api/setups', requireAuth, (req, res) => {
    let setups = readJsonFile('setups.json');
    setups = setups.filter(s => s.userId === req.session.userId);
    if (req.query.carId) {
        setups = setups.filter(s => s.carId === req.query.carId);
    }
    if (req.query.trackId) {
        setups = setups.filter(s => s.trackId === req.query.trackId);
    }
    res.json(setups);
});

// GET single setup (user's setup only)
app.get('/api/setups/:id', requireAuth, (req, res) => {
    const setups = readJsonFile('setups.json');
    const setup = setups.find(s => s.id === req.params.id && s.userId === req.session.userId);
    if (!setup) {
        return res.status(404).json({ error: 'Setup not found' });
    }
    res.json(setup);
});

// POST create setup
app.post('/api/setups', requireAuth, (req, res) => {
    const setups = readJsonFile('setups.json');
    const newSetup = {
        id: uuidv4(),
        userId: req.session.userId,
        carId: req.body.carId || null,
        trackId: req.body.trackId || null,
        name: req.body.name || '',
        date: req.body.date || new Date().toISOString().split('T')[0],
        toeFront: req.body.toeFront || '',
        toeRear: req.body.toeRear || '',
        camberFront: req.body.camberFront || '',
        camberRear: req.body.camberRear || '',
        casterFront: req.body.casterFront || '',
        cornerWeights: req.body.cornerWeights || { fl: 0, fr: 0, rl: 0, rr: 0 },
        totalWeight: req.body.totalWeight || 0,
        rideHeightFront: req.body.rideHeightFront || '',
        rideHeightRear: req.body.rideHeightRear || '',
        antiRollBarFront: req.body.antiRollBarFront || '',
        antiRollBarRear: req.body.antiRollBarRear || '',
        tyrePressures: req.body.tyrePressures || { fl: 0, fr: 0, rl: 0, rr: 0 },
        fuelQuantity: req.body.fuelQuantity || '',
        tyreMake: req.body.tyreMake || '',
        notes: req.body.notes || ''
    };
    setups.push(newSetup);
    writeJsonFile('setups.json', setups);
    res.status(201).json(newSetup);
});

// PUT update setup (user's setup only)
app.put('/api/setups/:id', requireAuth, (req, res) => {
    const setups = readJsonFile('setups.json');
    const index = setups.findIndex(s => s.id === req.params.id && s.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Setup not found' });
    }
    setups[index] = {
        ...setups[index],
        ...req.body,
        id: setups[index].id,
        userId: setups[index].userId // Preserve ID and userId
    };
    writeJsonFile('setups.json', setups);
    res.json(setups[index]);
});

// DELETE setup (user's setup only)
app.delete('/api/setups/:id', requireAuth, (req, res) => {
    let setups = readJsonFile('setups.json');
    const index = setups.findIndex(s => s.id === req.params.id && s.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Setup not found' });
    }
    setups.splice(index, 1);
    writeJsonFile('setups.json', setups);
    res.status(204).send();
});

// ============ TRACKS API ============

// GET all tracks (user's tracks only)
app.get('/api/tracks', requireAuth, (req, res) => {
    const tracks = readJsonFile('tracks.json');
    const userTracks = tracks.filter(t => t.userId === req.session.userId);
    res.json(userTracks);
});

// GET single track (user's track only)
app.get('/api/tracks/:id', requireAuth, (req, res) => {
    const tracks = readJsonFile('tracks.json');
    const track = tracks.find(t => t.id === req.params.id && t.userId === req.session.userId);
    if (!track) {
        return res.status(404).json({ error: 'Track not found' });
    }
    res.json(track);
});

// POST create track
app.post('/api/tracks', requireAuth, async (req, res) => {
    const tracks = readJsonFile('tracks.json');
    const trackId = uuidv4();

    // Download image if URL provided
    let imageUrl = req.body.imageUrl || '';
    if (imageUrl && !imageUrl.startsWith('/images/')) {
        try {
            imageUrl = await downloadTrackImage(imageUrl, trackId);
        } catch (err) {
            console.error('Failed to download track image:', err.message);
            // Keep original URL if download fails
        }
    }

    const newTrack = {
        id: trackId,
        userId: req.session.userId,
        name: req.body.name || '',
        location: req.body.location || '',
        length: req.body.length || '',
        imageUrl: imageUrl,
        corners: req.body.corners || []
    };
    tracks.push(newTrack);
    writeJsonFile('tracks.json', tracks);
    res.status(201).json(newTrack);
});

// PUT update track (user's track only)
app.put('/api/tracks/:id', requireAuth, async (req, res) => {
    const tracks = readJsonFile('tracks.json');
    const index = tracks.findIndex(t => t.id === req.params.id && t.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Track not found' });
    }

    // Download image if new external URL provided
    let imageUrl = req.body.imageUrl ?? tracks[index].imageUrl;
    if (req.body.imageUrl && !req.body.imageUrl.startsWith('/images/') && req.body.imageUrl !== tracks[index].imageUrl) {
        try {
            imageUrl = await downloadTrackImage(req.body.imageUrl, req.params.id);
        } catch (err) {
            console.error('Failed to download track image:', err.message);
            // Keep original URL if download fails
            imageUrl = req.body.imageUrl;
        }
    }

    tracks[index] = {
        ...tracks[index],
        name: req.body.name ?? tracks[index].name,
        location: req.body.location ?? tracks[index].location,
        length: req.body.length ?? tracks[index].length,
        imageUrl: imageUrl,
        corners: req.body.corners ?? tracks[index].corners ?? [],
        circuitNotes: req.body.circuitNotes ?? tracks[index].circuitNotes ?? ''
    };
    writeJsonFile('tracks.json', tracks);
    res.json(tracks[index]);
});

// DELETE track (user's track only)
app.delete('/api/tracks/:id', requireAuth, (req, res) => {
    let tracks = readJsonFile('tracks.json');
    const index = tracks.findIndex(t => t.id === req.params.id && t.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Track not found' });
    }
    tracks.splice(index, 1);
    writeJsonFile('tracks.json', tracks);

    // Also delete related track notes and clear track from setups (only user's)
    let trackNotes = readJsonFile('track-notes.json');
    trackNotes = trackNotes.filter(tn => !(tn.trackId === req.params.id && tn.userId === req.session.userId));
    writeJsonFile('track-notes.json', trackNotes);

    let setups = readJsonFile('setups.json');
    setups = setups.map(s => {
        if (s.trackId === req.params.id && s.userId === req.session.userId) {
            return { ...s, trackId: null };
        }
        return s;
    });
    writeJsonFile('setups.json', setups);

    res.status(204).send();
});

// ============ TRACK NOTES API ============

// GET all track notes (user's notes only, with optional filters)
app.get('/api/track-notes', requireAuth, (req, res) => {
    let trackNotes = readJsonFile('track-notes.json');
    trackNotes = trackNotes.filter(tn => tn.userId === req.session.userId);
    if (req.query.carId) {
        trackNotes = trackNotes.filter(tn => tn.carId === req.query.carId);
    }
    if (req.query.trackId) {
        trackNotes = trackNotes.filter(tn => tn.trackId === req.query.trackId);
    }
    res.json(trackNotes);
});

// GET single track note (user's note only)
app.get('/api/track-notes/:id', requireAuth, (req, res) => {
    const trackNotes = readJsonFile('track-notes.json');
    const note = trackNotes.find(tn => tn.id === req.params.id && tn.userId === req.session.userId);
    if (!note) {
        return res.status(404).json({ error: 'Track note not found' });
    }
    res.json(note);
});

// POST create track note
app.post('/api/track-notes', requireAuth, (req, res) => {
    const trackNotes = readJsonFile('track-notes.json');
    const newNote = {
        id: uuidv4(),
        userId: req.session.userId,
        carId: req.body.carId || null,
        trackId: req.body.trackId || null,
        notes: req.body.notes || ''
    };
    trackNotes.push(newNote);
    writeJsonFile('track-notes.json', trackNotes);
    res.status(201).json(newNote);
});

// PUT update track note (user's note only)
app.put('/api/track-notes/:id', requireAuth, (req, res) => {
    const trackNotes = readJsonFile('track-notes.json');
    const index = trackNotes.findIndex(tn => tn.id === req.params.id && tn.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Track note not found' });
    }
    trackNotes[index] = {
        ...trackNotes[index],
        carId: req.body.carId ?? trackNotes[index].carId,
        trackId: req.body.trackId ?? trackNotes[index].trackId,
        notes: req.body.notes ?? trackNotes[index].notes
    };
    writeJsonFile('track-notes.json', trackNotes);
    res.json(trackNotes[index]);
});

// DELETE track note (user's note only)
app.delete('/api/track-notes/:id', requireAuth, (req, res) => {
    let trackNotes = readJsonFile('track-notes.json');
    const index = trackNotes.findIndex(tn => tn.id === req.params.id && tn.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Track note not found' });
    }
    trackNotes.splice(index, 1);
    writeJsonFile('track-notes.json', trackNotes);
    res.status(204).send();
});

// ============ CORNER NOTES API ============

// GET corner notes for a session
app.get('/api/corner-notes', requireAuth, (req, res) => {
    let cornerNotes = readJsonFile('corner-notes.json');
    cornerNotes = cornerNotes.filter(cn => cn.userId === req.session.userId);
    if (req.query.sessionId) {
        cornerNotes = cornerNotes.filter(cn => cn.sessionId === req.query.sessionId);
    }
    res.json(cornerNotes);
});

// GET single corner note
app.get('/api/corner-notes/:id', requireAuth, (req, res) => {
    const cornerNotes = readJsonFile('corner-notes.json');
    const note = cornerNotes.find(cn => cn.id === req.params.id && cn.userId === req.session.userId);
    if (!note) {
        return res.status(404).json({ error: 'Corner note not found' });
    }
    res.json(note);
});

// POST create or update corner note (upsert by sessionId + cornerName)
app.post('/api/corner-notes', requireAuth, (req, res) => {
    const cornerNotes = readJsonFile('corner-notes.json');
    const { sessionId, cornerName, field, value } = req.body;

    if (!sessionId || !cornerName) {
        return res.status(400).json({ error: 'sessionId and cornerName are required' });
    }

    // Check if note already exists for this session + corner combination
    const existingIndex = cornerNotes.findIndex(
        cn => cn.sessionId === sessionId && cn.cornerName === cornerName && cn.userId === req.session.userId
    );

    if (existingIndex !== -1) {
        // Update existing - update specific field if provided
        if (field && ['entry', 'apex', 'exit'].includes(field)) {
            cornerNotes[existingIndex][field] = value || '';
        }
        writeJsonFile('corner-notes.json', cornerNotes);
        res.json(cornerNotes[existingIndex]);
    } else {
        // Create new
        const newNote = {
            id: uuidv4(),
            userId: req.session.userId,
            sessionId: sessionId,
            cornerName: cornerName,
            entry: field === 'entry' ? (value || '') : '',
            apex: field === 'apex' ? (value || '') : '',
            exit: field === 'exit' ? (value || '') : ''
        };
        cornerNotes.push(newNote);
        writeJsonFile('corner-notes.json', cornerNotes);
        res.status(201).json(newNote);
    }
});

// DELETE corner note
app.delete('/api/corner-notes/:id', requireAuth, (req, res) => {
    let cornerNotes = readJsonFile('corner-notes.json');
    const index = cornerNotes.findIndex(cn => cn.id === req.params.id && cn.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Corner note not found' });
    }
    cornerNotes.splice(index, 1);
    writeJsonFile('corner-notes.json', cornerNotes);
    res.status(204).send();
});

// ============ SESSIONS API ============

// GET all sessions (user's sessions only, with optional filters)
app.get('/api/sessions', requireAuth, (req, res) => {
    let sessions = readJsonFile('sessions.json');
    sessions = sessions.filter(s => s.userId === req.session.userId);
    if (req.query.carId) {
        sessions = sessions.filter(s => s.carId === req.query.carId);
    }
    if (req.query.trackId) {
        sessions = sessions.filter(s => s.trackId === req.query.trackId);
    }
    res.json(sessions);
});

// GET single session (user's session only)
app.get('/api/sessions/:id', requireAuth, (req, res) => {
    const sessions = readJsonFile('sessions.json');
    const session = sessions.find(s => s.id === req.params.id && s.userId === req.session.userId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
});

// POST create session
app.post('/api/sessions', requireAuth, (req, res) => {
    const sessions = readJsonFile('sessions.json');
    const newSession = {
        id: uuidv4(),
        userId: req.session.userId,
        carId: req.body.carId || null,
        trackId: req.body.trackId || null,
        type: req.body.type || '',
        name: req.body.name || req.body.type || '',
        date: req.body.date || new Date().toISOString().split('T')[0],
        trackConditions: req.body.trackConditions || '',
        tyrePressures: req.body.tyrePressures || null,
        frontARB: req.body.frontARB || '',
        rearARB: req.body.rearARB || '',
        brakeBias: req.body.brakeBias || '',
        setupComments: req.body.setupComments || '',
        focusAreas: req.body.focusAreas || '',
        bestLaptime: req.body.bestLaptime || '',
        idealLaptime: req.body.idealLaptime || '',
        series: req.body.series || ''
    };
    sessions.push(newSession);
    writeJsonFile('sessions.json', sessions);
    res.status(201).json(newSession);
});

// PUT update session (user's session only)
app.put('/api/sessions/:id', requireAuth, (req, res) => {
    const sessions = readJsonFile('sessions.json');
    const index = sessions.findIndex(s => s.id === req.params.id && s.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Session not found' });
    }
    sessions[index] = {
        ...sessions[index],
        type: req.body.type ?? sessions[index].type,
        name: req.body.name ?? sessions[index].name,
        date: req.body.date ?? sessions[index].date,
        trackConditions: req.body.trackConditions ?? sessions[index].trackConditions,
        tyrePressures: req.body.tyrePressures ?? sessions[index].tyrePressures,
        frontARB: req.body.frontARB ?? sessions[index].frontARB,
        rearARB: req.body.rearARB ?? sessions[index].rearARB,
        brakeBias: req.body.brakeBias ?? sessions[index].brakeBias,
        setupComments: req.body.setupComments ?? sessions[index].setupComments,
        focusAreas: req.body.focusAreas ?? sessions[index].focusAreas,
        bestLaptime: req.body.bestLaptime ?? sessions[index].bestLaptime,
        idealLaptime: req.body.idealLaptime ?? sessions[index].idealLaptime,
        series: req.body.series ?? sessions[index].series
    };
    writeJsonFile('sessions.json', sessions);
    res.json(sessions[index]);
});

// DELETE session (user's session only)
app.delete('/api/sessions/:id', requireAuth, (req, res) => {
    let sessions = readJsonFile('sessions.json');
    const index = sessions.findIndex(s => s.id === req.params.id && s.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Session not found' });
    }
    sessions.splice(index, 1);
    writeJsonFile('sessions.json', sessions);

    // Also delete related corner notes for this session
    let cornerNotes = readJsonFile('corner-notes.json');
    cornerNotes = cornerNotes.filter(cn => !(cn.sessionId === req.params.id && cn.userId === req.session.userId));
    writeJsonFile('corner-notes.json', cornerNotes);

    res.status(204).send();
});

// ============ MAINTENANCE API ============

// GET all maintenance tasks (user's tasks only, with optional carId filter)
app.get('/api/maintenance', requireAuth, (req, res) => {
    let maintenance = readJsonFile('maintenance.json');
    maintenance = maintenance.filter(m => m.userId === req.session.userId);
    if (req.query.carId) {
        maintenance = maintenance.filter(m => m.carId === req.query.carId);
    }
    res.json(maintenance);
});

// GET single maintenance task (user's task only)
app.get('/api/maintenance/:id', requireAuth, (req, res) => {
    const maintenance = readJsonFile('maintenance.json');
    const task = maintenance.find(m => m.id === req.params.id && m.userId === req.session.userId);
    if (!task) {
        return res.status(404).json({ error: 'Maintenance task not found' });
    }
    res.json(task);
});

// POST create maintenance task
app.post('/api/maintenance', requireAuth, (req, res) => {
    const maintenance = readJsonFile('maintenance.json');
    const newTask = {
        id: uuidv4(),
        userId: req.session.userId,
        carId: req.body.carId || null,
        date: req.body.date || new Date().toISOString().split('T')[0],
        type: req.body.type || [],
        name: req.body.name || '',
        description: req.body.description || '',
        mileage: req.body.mileage || '',
        partsUsed: req.body.partsUsed || '',
        notes: req.body.notes || ''
    };
    maintenance.push(newTask);
    writeJsonFile('maintenance.json', maintenance);
    res.status(201).json(newTask);
});

// PUT update maintenance task (user's task only)
app.put('/api/maintenance/:id', requireAuth, (req, res) => {
    const maintenance = readJsonFile('maintenance.json');
    const index = maintenance.findIndex(m => m.id === req.params.id && m.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Maintenance task not found' });
    }
    maintenance[index] = {
        ...maintenance[index],
        ...req.body,
        id: maintenance[index].id,
        userId: maintenance[index].userId
    };
    writeJsonFile('maintenance.json', maintenance);
    res.json(maintenance[index]);
});

// DELETE maintenance task (user's task only)
app.delete('/api/maintenance/:id', requireAuth, (req, res) => {
    let maintenance = readJsonFile('maintenance.json');
    const index = maintenance.findIndex(m => m.id === req.params.id && m.userId === req.session.userId);
    if (index === -1) {
        return res.status(404).json({ error: 'Maintenance task not found' });
    }
    maintenance.splice(index, 1);
    writeJsonFile('maintenance.json', maintenance);
    res.status(204).send();
});

// ============ EXPORT / IMPORT API ============

// POST export data
app.post('/api/export', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { carIds = [], trackIds = [], includeSetups, includeSessions, includeMaintenance, includeTrackNotes } = req.body;

    if (carIds.length === 0 && trackIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one car or track to export' });
    }

    const allCars = readJsonFile('cars.json').filter(c => c.userId === userId);
    const allTracks = readJsonFile('tracks.json').filter(t => t.userId === userId);

    const cars = allCars.filter(c => carIds.includes(c.id));
    const tracks = allTracks.filter(t => trackIds.includes(t.id));

    const exportData = { cars, tracks };

    if (includeSetups) {
        const allSetups = readJsonFile('setups.json').filter(s => s.userId === userId);
        exportData.setups = allSetups.filter(s =>
            (s.carId && carIds.includes(s.carId)) || (s.trackId && trackIds.includes(s.trackId))
        );
    }

    if (includeSessions) {
        const allSessions = readJsonFile('sessions.json').filter(s => s.userId === userId);
        exportData.sessions = allSessions.filter(s =>
            (s.carId && carIds.includes(s.carId)) || (s.trackId && trackIds.includes(s.trackId))
        );

        // Include corner notes for exported sessions
        const sessionIds = exportData.sessions.map(s => s.id);
        const allCornerNotes = readJsonFile('corner-notes.json').filter(cn => cn.userId === userId);
        exportData.cornerNotes = allCornerNotes.filter(cn => sessionIds.includes(cn.sessionId));
    }

    if (includeTrackNotes) {
        const allTrackNotes = readJsonFile('track-notes.json').filter(tn => tn.userId === userId);
        exportData.trackNotes = allTrackNotes.filter(tn =>
            (tn.carId && carIds.includes(tn.carId)) || (tn.trackId && trackIds.includes(tn.trackId))
        );
    }

    if (includeMaintenance) {
        const allMaintenance = readJsonFile('maintenance.json').filter(m => m.userId === userId);
        exportData.maintenance = allMaintenance.filter(m => m.carId && carIds.includes(m.carId));
    }

    // Include track images as base64
    const trackImages = [];
    for (const track of tracks) {
        if (track.imageUrl && track.imageUrl.startsWith('/images/tracks/')) {
            const filename = path.basename(track.imageUrl);
            const imagePath = path.join(TRACK_IMAGES_DIR, filename);
            if (fs.existsSync(imagePath)) {
                try {
                    const imageData = fs.readFileSync(imagePath).toString('base64');
                    trackImages.push({ filename, data: imageData });
                } catch (err) {
                    console.error('Failed to read track image:', err.message);
                }
            }
        }
    }
    exportData.trackImages = trackImages;

    const exportEnvelope = {
        version: 1,
        exportDate: new Date().toISOString(),
        appName: 'RaceLog',
        data: exportData
    };

    res.json(exportEnvelope);
});

// POST import data
app.post('/api/import', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { data: importEnvelope, mode } = req.body;

    if (!importEnvelope || !importEnvelope.version || !importEnvelope.data) {
        return res.status(400).json({ error: 'Invalid export file format' });
    }

    if (!['overwrite', 'preserve'].includes(mode)) {
        return res.status(400).json({ error: 'Import mode must be "overwrite" or "preserve"' });
    }

    const importData = importEnvelope.data;
    const summary = {
        carsImported: 0, carsSkipped: 0,
        tracksImported: 0, tracksSkipped: 0,
        setupsImported: 0, setupsSkipped: 0,
        sessionsImported: 0, sessionsSkipped: 0,
        cornerNotesImported: 0,
        trackNotesImported: 0, trackNotesSkipped: 0,
        maintenanceImported: 0, maintenanceSkipped: 0
    };

    // ID remapping: old ID -> new ID
    const carIdMap = {};
    const trackIdMap = {};
    const sessionIdMap = {};
    // Track which original IDs were skipped in preserve mode
    const skippedCarIds = new Set();
    const skippedTrackIds = new Set();

    // --- Import Cars ---
    if (importData.cars && importData.cars.length > 0) {
        const existingCars = readJsonFile('cars.json');
        const userCars = existingCars.filter(c => c.userId === userId);

        for (const importCar of importData.cars) {
            const match = userCars.find(c =>
                c.name === importCar.name &&
                c.manufacturer === importCar.manufacturer &&
                c.series === importCar.series
            );

            if (match) {
                if (mode === 'overwrite') {
                    carIdMap[importCar.id] = match.id;
                    const idx = existingCars.findIndex(c => c.id === match.id);
                    existingCars[idx] = { ...existingCars[idx], name: importCar.name, manufacturer: importCar.manufacturer, series: importCar.series };
                    summary.carsImported++;
                } else {
                    carIdMap[importCar.id] = match.id;
                    skippedCarIds.add(importCar.id);
                    summary.carsSkipped++;
                }
            } else {
                const newId = uuidv4();
                carIdMap[importCar.id] = newId;
                existingCars.push({ id: newId, userId, name: importCar.name || '', manufacturer: importCar.manufacturer || '', series: importCar.series || '' });
                summary.carsImported++;
            }
        }
        writeJsonFile('cars.json', existingCars);
    }

    // --- Import Tracks ---
    if (importData.tracks && importData.tracks.length > 0) {
        const existingTracks = readJsonFile('tracks.json');
        const userTracks = existingTracks.filter(t => t.userId === userId);

        for (const importTrack of importData.tracks) {
            const match = userTracks.find(t =>
                t.name === importTrack.name &&
                t.location === importTrack.location
            );

            if (match) {
                if (mode === 'overwrite') {
                    trackIdMap[importTrack.id] = match.id;
                    const idx = existingTracks.findIndex(t => t.id === match.id);
                    existingTracks[idx] = {
                        ...existingTracks[idx],
                        name: importTrack.name,
                        location: importTrack.location,
                        length: importTrack.length,
                        corners: importTrack.corners,
                        circuitNotes: importTrack.circuitNotes,
                        imageUrl: importTrack.imageUrl
                    };
                    summary.tracksImported++;
                } else {
                    trackIdMap[importTrack.id] = match.id;
                    skippedTrackIds.add(importTrack.id);
                    summary.tracksSkipped++;
                }
            } else {
                const newId = uuidv4();
                trackIdMap[importTrack.id] = newId;
                // Update imageUrl to use new track ID if it was a local image
                let imageUrl = importTrack.imageUrl || '';
                if (imageUrl.startsWith('/images/tracks/')) {
                    const ext = path.extname(imageUrl);
                    imageUrl = `/images/tracks/${newId}${ext}`;
                }
                existingTracks.push({
                    id: newId, userId,
                    name: importTrack.name || '',
                    location: importTrack.location || '',
                    length: importTrack.length || '',
                    imageUrl: imageUrl,
                    corners: importTrack.corners || [],
                    circuitNotes: importTrack.circuitNotes || ''
                });
                summary.tracksImported++;
            }
        }
        writeJsonFile('tracks.json', existingTracks);
    }

    // --- Save track images ---
    if (importData.trackImages && importData.trackImages.length > 0) {
        for (const img of importData.trackImages) {
            // Find which imported track this image belongs to
            const originalTrackId = img.filename.replace(/\.[^.]+$/, '');
            const newTrackId = trackIdMap[originalTrackId];
            if (newTrackId) {
                const ext = path.extname(img.filename);
                const newFilename = `${newTrackId}${ext}`;
                const destPath = path.join(TRACK_IMAGES_DIR, newFilename);
                try {
                    fs.writeFileSync(destPath, Buffer.from(img.data, 'base64'));
                } catch (err) {
                    console.error('Failed to save track image:', err.message);
                }
            }
        }
    }

    // --- Import Setups ---
    if (importData.setups && importData.setups.length > 0) {
        const existingSetups = readJsonFile('setups.json');

        if (mode === 'overwrite') {
            // Remove existing setups for the imported cars/tracks owned by this user
            const newCarIds = new Set(Object.values(carIdMap));
            const newTrackIds = new Set(Object.values(trackIdMap));
            const toRemove = existingSetups.filter(s =>
                s.userId === userId &&
                ((s.carId && newCarIds.has(s.carId)) || (s.trackId && newTrackIds.has(s.trackId)))
            ).map(s => s.id);
            const filtered = existingSetups.filter(s => !toRemove.includes(s.id));

            for (const setup of importData.setups) {
                const newSetup = { ...setup, id: uuidv4(), userId };
                if (newSetup.carId) newSetup.carId = carIdMap[newSetup.carId] || newSetup.carId;
                if (newSetup.trackId) newSetup.trackId = trackIdMap[newSetup.trackId] || newSetup.trackId;
                filtered.push(newSetup);
                summary.setupsImported++;
            }
            writeJsonFile('setups.json', filtered);
        } else {
            // Preserve: only add setups for non-skipped cars/tracks
            for (const setup of importData.setups) {
                const carSkipped = setup.carId && skippedCarIds.has(setup.carId);
                const trackSkipped = setup.trackId && skippedTrackIds.has(setup.trackId);
                if (carSkipped || trackSkipped) {
                    summary.setupsSkipped++;
                    continue;
                }
                const newSetup = { ...setup, id: uuidv4(), userId };
                if (newSetup.carId) newSetup.carId = carIdMap[newSetup.carId] || newSetup.carId;
                if (newSetup.trackId) newSetup.trackId = trackIdMap[newSetup.trackId] || newSetup.trackId;
                existingSetups.push(newSetup);
                summary.setupsImported++;
            }
            writeJsonFile('setups.json', existingSetups);
        }
    }

    // --- Import Sessions + Corner Notes ---
    if (importData.sessions && importData.sessions.length > 0) {
        const existingSessions = readJsonFile('sessions.json');

        if (mode === 'overwrite') {
            const newCarIds = new Set(Object.values(carIdMap));
            const newTrackIds = new Set(Object.values(trackIdMap));
            const toRemove = existingSessions.filter(s =>
                s.userId === userId &&
                ((s.carId && newCarIds.has(s.carId)) || (s.trackId && newTrackIds.has(s.trackId)))
            ).map(s => s.id);
            const filtered = existingSessions.filter(s => !toRemove.includes(s.id));

            // Also remove corner notes for removed sessions
            let existingCornerNotes = readJsonFile('corner-notes.json');
            existingCornerNotes = existingCornerNotes.filter(cn => !toRemove.includes(cn.sessionId) || cn.userId !== userId);

            for (const session of importData.sessions) {
                const newId = uuidv4();
                sessionIdMap[session.id] = newId;
                const newSession = { ...session, id: newId, userId };
                if (newSession.carId) newSession.carId = carIdMap[newSession.carId] || newSession.carId;
                if (newSession.trackId) newSession.trackId = trackIdMap[newSession.trackId] || newSession.trackId;
                filtered.push(newSession);
                summary.sessionsImported++;
            }
            writeJsonFile('sessions.json', filtered);

            // Import corner notes
            if (importData.cornerNotes && importData.cornerNotes.length > 0) {
                for (const cn of importData.cornerNotes) {
                    const newCn = { ...cn, id: uuidv4(), userId };
                    if (newCn.sessionId) newCn.sessionId = sessionIdMap[newCn.sessionId] || newCn.sessionId;
                    existingCornerNotes.push(newCn);
                    summary.cornerNotesImported++;
                }
            }
            writeJsonFile('corner-notes.json', existingCornerNotes);
        } else {
            // Preserve: only add sessions for non-skipped cars/tracks
            const existingCornerNotes = readJsonFile('corner-notes.json');

            for (const session of importData.sessions) {
                const carSkipped = session.carId && skippedCarIds.has(session.carId);
                const trackSkipped = session.trackId && skippedTrackIds.has(session.trackId);
                if (carSkipped || trackSkipped) {
                    summary.sessionsSkipped++;
                    continue;
                }
                const newId = uuidv4();
                sessionIdMap[session.id] = newId;
                const newSession = { ...session, id: newId, userId };
                if (newSession.carId) newSession.carId = carIdMap[newSession.carId] || newSession.carId;
                if (newSession.trackId) newSession.trackId = trackIdMap[newSession.trackId] || newSession.trackId;
                existingSessions.push(newSession);
                summary.sessionsImported++;
            }
            writeJsonFile('sessions.json', existingSessions);

            // Import corner notes for imported sessions only
            if (importData.cornerNotes && importData.cornerNotes.length > 0) {
                for (const cn of importData.cornerNotes) {
                    if (!sessionIdMap[cn.sessionId]) continue; // Session was skipped
                    const newCn = { ...cn, id: uuidv4(), userId };
                    newCn.sessionId = sessionIdMap[newCn.sessionId] || newCn.sessionId;
                    existingCornerNotes.push(newCn);
                    summary.cornerNotesImported++;
                }
            }
            writeJsonFile('corner-notes.json', existingCornerNotes);
        }
    }

    // --- Import Track Notes ---
    if (importData.trackNotes && importData.trackNotes.length > 0) {
        const existingTrackNotes = readJsonFile('track-notes.json');

        if (mode === 'overwrite') {
            const newCarIds = new Set(Object.values(carIdMap));
            const newTrackIds = new Set(Object.values(trackIdMap));
            const toRemove = existingTrackNotes.filter(tn =>
                tn.userId === userId &&
                ((tn.carId && newCarIds.has(tn.carId)) || (tn.trackId && newTrackIds.has(tn.trackId)))
            ).map(tn => tn.id);
            const filtered = existingTrackNotes.filter(tn => !toRemove.includes(tn.id));

            for (const tn of importData.trackNotes) {
                const newTn = { ...tn, id: uuidv4(), userId };
                if (newTn.carId) newTn.carId = carIdMap[newTn.carId] || newTn.carId;
                if (newTn.trackId) newTn.trackId = trackIdMap[newTn.trackId] || newTn.trackId;
                filtered.push(newTn);
                summary.trackNotesImported++;
            }
            writeJsonFile('track-notes.json', filtered);
        } else {
            for (const tn of importData.trackNotes) {
                const carSkipped = tn.carId && skippedCarIds.has(tn.carId);
                const trackSkipped = tn.trackId && skippedTrackIds.has(tn.trackId);
                if (carSkipped || trackSkipped) {
                    summary.trackNotesSkipped++;
                    continue;
                }
                const newTn = { ...tn, id: uuidv4(), userId };
                if (newTn.carId) newTn.carId = carIdMap[newTn.carId] || newTn.carId;
                if (newTn.trackId) newTn.trackId = trackIdMap[newTn.trackId] || newTn.trackId;
                existingTrackNotes.push(newTn);
                summary.trackNotesImported++;
            }
            writeJsonFile('track-notes.json', existingTrackNotes);
        }
    }

    // --- Import Maintenance ---
    if (importData.maintenance && importData.maintenance.length > 0) {
        const existingMaintenance = readJsonFile('maintenance.json');

        if (mode === 'overwrite') {
            const newCarIds = new Set(Object.values(carIdMap));
            const toRemove = existingMaintenance.filter(m =>
                m.userId === userId && m.carId && newCarIds.has(m.carId)
            ).map(m => m.id);
            const filtered = existingMaintenance.filter(m => !toRemove.includes(m.id));

            for (const m of importData.maintenance) {
                const newM = { ...m, id: uuidv4(), userId };
                if (newM.carId) newM.carId = carIdMap[newM.carId] || newM.carId;
                filtered.push(newM);
                summary.maintenanceImported++;
            }
            writeJsonFile('maintenance.json', filtered);
        } else {
            for (const m of importData.maintenance) {
                const carSkipped = m.carId && skippedCarIds.has(m.carId);
                if (carSkipped) {
                    summary.maintenanceSkipped++;
                    continue;
                }
                const newM = { ...m, id: uuidv4(), userId };
                if (newM.carId) newM.carId = carIdMap[newM.carId] || newM.carId;
                existingMaintenance.push(newM);
                summary.maintenanceImported++;
            }
            writeJsonFile('maintenance.json', existingMaintenance);
        }
    }

    res.json(summary);
});

// ============ BULK DELETE API ============

// POST bulk delete cars/tracks with cascade
app.post('/api/bulk-delete', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { carIds = [], trackIds = [] } = req.body;

    if (carIds.length === 0 && trackIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one car or track to delete' });
    }

    const summary = {
        carsDeleted: 0,
        tracksDeleted: 0,
        setupsDeleted: 0,
        sessionsDeleted: 0,
        cornerNotesDeleted: 0,
        trackNotesDeleted: 0,
        maintenanceDeleted: 0
    };

    // --- Car cascade ---
    if (carIds.length > 0) {
        let cars = readJsonFile('cars.json');
        const userCarIds = cars.filter(c => c.userId === userId && carIds.includes(c.id)).map(c => c.id);
        const carIdSet = new Set(userCarIds);

        // Delete setups for these cars
        let setups = readJsonFile('setups.json');
        const setupsBefore = setups.length;
        setups = setups.filter(s => !(s.userId === userId && s.carId && carIdSet.has(s.carId)));
        summary.setupsDeleted += setupsBefore - setups.length;
        writeJsonFile('setups.json', setups);

        // Delete sessions for these cars + their corner notes
        let sessions = readJsonFile('sessions.json');
        const sessionIdsToDelete = sessions
            .filter(s => s.userId === userId && s.carId && carIdSet.has(s.carId))
            .map(s => s.id);
        const sessionIdSet = new Set(sessionIdsToDelete);

        const sessionsBefore = sessions.length;
        sessions = sessions.filter(s => !sessionIdSet.has(s.id));
        summary.sessionsDeleted += sessionsBefore - sessions.length;
        writeJsonFile('sessions.json', sessions);

        let cornerNotes = readJsonFile('corner-notes.json');
        const cnBefore = cornerNotes.length;
        cornerNotes = cornerNotes.filter(cn => !(cn.userId === userId && sessionIdSet.has(cn.sessionId)));
        summary.cornerNotesDeleted += cnBefore - cornerNotes.length;
        writeJsonFile('corner-notes.json', cornerNotes);

        // Delete track notes for these cars
        let trackNotes = readJsonFile('track-notes.json');
        const tnBefore = trackNotes.length;
        trackNotes = trackNotes.filter(tn => !(tn.userId === userId && tn.carId && carIdSet.has(tn.carId)));
        summary.trackNotesDeleted += tnBefore - trackNotes.length;
        writeJsonFile('track-notes.json', trackNotes);

        // Delete maintenance for these cars
        let maintenance = readJsonFile('maintenance.json');
        const mBefore = maintenance.length;
        maintenance = maintenance.filter(m => !(m.userId === userId && m.carId && carIdSet.has(m.carId)));
        summary.maintenanceDeleted += mBefore - maintenance.length;
        writeJsonFile('maintenance.json', maintenance);

        // Delete the cars
        const carsBefore = cars.length;
        cars = cars.filter(c => !(c.userId === userId && carIdSet.has(c.id)));
        summary.carsDeleted += carsBefore - cars.length;
        writeJsonFile('cars.json', cars);
    }

    // --- Track cascade ---
    if (trackIds.length > 0) {
        let tracks = readJsonFile('tracks.json');
        const userTrackIds = tracks.filter(t => t.userId === userId && trackIds.includes(t.id)).map(t => t.id);
        const trackIdSet = new Set(userTrackIds);

        // Delete setups for these tracks
        let setups = readJsonFile('setups.json');
        const setupsBefore = setups.length;
        setups = setups.filter(s => !(s.userId === userId && s.trackId && trackIdSet.has(s.trackId)));
        summary.setupsDeleted += setupsBefore - setups.length;
        writeJsonFile('setups.json', setups);

        // Delete sessions for these tracks + their corner notes
        let sessions = readJsonFile('sessions.json');
        const sessionIdsToDelete = sessions
            .filter(s => s.userId === userId && s.trackId && trackIdSet.has(s.trackId))
            .map(s => s.id);
        const sessionIdSet = new Set(sessionIdsToDelete);

        const sessionsBefore = sessions.length;
        sessions = sessions.filter(s => !sessionIdSet.has(s.id));
        summary.sessionsDeleted += sessionsBefore - sessions.length;
        writeJsonFile('sessions.json', sessions);

        let cornerNotes = readJsonFile('corner-notes.json');
        const cnBefore = cornerNotes.length;
        cornerNotes = cornerNotes.filter(cn => !(cn.userId === userId && sessionIdSet.has(cn.sessionId)));
        summary.cornerNotesDeleted += cnBefore - cornerNotes.length;
        writeJsonFile('corner-notes.json', cornerNotes);

        // Delete track notes for these tracks
        let trackNotes = readJsonFile('track-notes.json');
        const tnBefore = trackNotes.length;
        trackNotes = trackNotes.filter(tn => !(tn.userId === userId && tn.trackId && trackIdSet.has(tn.trackId)));
        summary.trackNotesDeleted += tnBefore - trackNotes.length;
        writeJsonFile('track-notes.json', trackNotes);

        // Delete the tracks
        const tracksBefore = tracks.length;
        tracks = tracks.filter(t => !(t.userId === userId && trackIdSet.has(t.id)));
        summary.tracksDeleted += tracksBefore - tracks.length;
        writeJsonFile('tracks.json', tracks);
    }

    res.json(summary);
});

// Start server only if not being imported for testing
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`RaceLog server running at http://localhost:${PORT}`);
    });
}

// Export app for testing
module.exports = app;
