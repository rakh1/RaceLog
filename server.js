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
const DATA_DIR = path.join(basePath, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR);
}

// Track images directory
const TRACK_IMAGES_DIR = path.join(publicPath, 'images', 'tracks');
if (!fs.existsSync(path.join(publicPath, 'images'))) {
    fs.mkdirSync(path.join(publicPath, 'images'));
}
if (!fs.existsSync(TRACK_IMAGES_DIR)) {
    fs.mkdirSync(TRACK_IMAGES_DIR);
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
app.use(express.json());

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

app.use(express.static(publicPath));

// Helper functions for JSON file operations
function readJsonFile(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
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
        focusAreas: req.body.focusAreas || ''
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
        focusAreas: req.body.focusAreas ?? sessions[index].focusAreas
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
        type: req.body.type || '',
        name: req.body.name || '',
        description: req.body.description || '',
        cost: req.body.cost || 0,
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

// Start server
app.listen(PORT, () => {
    console.log(`RaceLog server running at http://localhost:${PORT}`);
});
