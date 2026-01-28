const request = require('supertest');
const app = require('../../server');

/**
 * Create a test user and return authenticated agent
 */
async function createAuthenticatedAgent(userData = {}) {
  const agent = request.agent(app);
  const username = userData.username || `testuser_${Date.now()}`;
  const password = userData.password || 'testpass123';

  await agent
    .post('/api/auth/register')
    .send({ username, password });

  await agent
    .post('/api/auth/login')
    .send({ username, password });

  return { agent, username, password };
}

/**
 * Create a test car
 */
async function createTestCar(agent, carData = {}) {
  const response = await agent
    .post('/api/cars')
    .send({
      name: carData.name || 'Test Car',
      manufacturer: carData.manufacturer || 'Test Manufacturer',
      series: carData.series || 'Test Series'
    });
  return response.body;
}

/**
 * Create a test track
 */
async function createTestTrack(agent, trackData = {}) {
  const response = await agent
    .post('/api/tracks')
    .send({
      name: trackData.name || 'Test Track',
      location: trackData.location || 'Test Location',
      length: trackData.length || '3.5km',
      corners: trackData.corners || [{ name: 'Turn 1' }, { name: 'Turn 2' }]
    });
  return response.body;
}

/**
 * Create a test setup
 */
async function createTestSetup(agent, setupData = {}) {
  const response = await agent
    .post('/api/setups')
    .send({
      name: setupData.name || 'Test Setup',
      carId: setupData.carId || null,
      trackId: setupData.trackId || null,
      toeFront: setupData.toeFront || '0.5mm',
      toeRear: setupData.toeRear || '1.0mm',
      camberFront: setupData.camberFront || '-2.5deg',
      camberRear: setupData.camberRear || '-1.5deg'
    });
  return response.body;
}

/**
 * Create a test session
 */
async function createTestSession(agent, sessionData = {}) {
  const response = await agent
    .post('/api/sessions')
    .send({
      name: sessionData.name || 'Test Session',
      type: sessionData.type || 'Practice',
      carId: sessionData.carId || null,
      trackId: sessionData.trackId || null,
      date: sessionData.date || '2024-01-15',
      bestLaptime: sessionData.bestLaptime || '1:45.500'
    });
  return response.body;
}

/**
 * Create a test maintenance task
 */
async function createTestMaintenance(agent, maintenanceData = {}) {
  const response = await agent
    .post('/api/maintenance')
    .send({
      name: maintenanceData.name || 'Test Maintenance',
      carId: maintenanceData.carId || null,
      date: maintenanceData.date || '2024-01-15',
      type: maintenanceData.type || ['Oil Change'],
      description: maintenanceData.description || 'Test description'
    });
  return response.body;
}

/**
 * Create a test corner note
 */
async function createTestCornerNote(agent, noteData = {}) {
  const response = await agent
    .post('/api/corner-notes')
    .send({
      sessionId: noteData.sessionId,
      cornerName: noteData.cornerName || 'Turn 1',
      field: noteData.field || 'entry',
      value: noteData.value || 'Brake at 100m marker'
    });
  return response.body;
}

/**
 * Create a test track note
 */
async function createTestTrackNote(agent, noteData = {}) {
  const response = await agent
    .post('/api/track-notes')
    .send({
      carId: noteData.carId || null,
      trackId: noteData.trackId || null,
      notes: noteData.notes || 'Test track notes'
    });
  return response.body;
}

module.exports = {
  createAuthenticatedAgent,
  createTestCar,
  createTestTrack,
  createTestSetup,
  createTestSession,
  createTestMaintenance,
  createTestCornerNote,
  createTestTrackNote
};
