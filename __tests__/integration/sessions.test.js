const request = require('supertest');
const app = require('../../server');
const {
  createAuthenticatedAgent,
  createTestCar,
  createTestTrack,
  createTestSession
} = require('../setup/testHelpers');

describe('Sessions API', () => {
  let agent;

  beforeEach(async () => {
    const auth = await createAuthenticatedAgent();
    agent = auth.agent;
  });

  describe('POST /api/sessions', () => {
    it('should create a new session', async () => {
      const car = await createTestCar(agent);
      const track = await createTestTrack(agent);

      const response = await agent
        .post('/api/sessions')
        .send({
          name: 'Practice Session 1',
          type: 'Practice',
          carId: car.id,
          trackId: track.id,
          date: '2024-01-15',
          trackConditions: 'Dry',
          bestLaptime: '1:45.500'
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Practice Session 1');
      expect(response.body.type).toBe('Practice');
      expect(response.body.carId).toBe(car.id);
      expect(response.body.trackId).toBe(track.id);
      expect(response.body.bestLaptime).toBe('1:45.500');
      expect(response.body.id).toBeDefined();
    });

    it('should create session with default values', async () => {
      const response = await agent
        .post('/api/sessions')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('');
      expect(response.body.type).toBe('');
      expect(response.body.carId).toBeNull();
      expect(response.body.trackId).toBeNull();
    });

    it('should use type as name if name not provided', async () => {
      const response = await agent
        .post('/api/sessions')
        .send({ type: 'Qualifying' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Qualifying');
      expect(response.body.type).toBe('Qualifying');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/sessions')
        .send({ name: 'Test Session' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/sessions', () => {
    it('should return all user sessions', async () => {
      await createTestSession(agent, { name: 'Session 1' });
      await createTestSession(agent, { name: 'Session 2' });

      const response = await agent.get('/api/sessions');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should filter by carId', async () => {
      const car1 = await createTestCar(agent, { name: 'Car 1' });
      const car2 = await createTestCar(agent, { name: 'Car 2' });

      await createTestSession(agent, { name: 'Session for Car 1', carId: car1.id });
      await createTestSession(agent, { name: 'Session for Car 2', carId: car2.id });

      const response = await agent.get(`/api/sessions?carId=${car1.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Session for Car 1');
    });

    it('should filter by trackId', async () => {
      const track1 = await createTestTrack(agent, { name: 'Track 1' });
      const track2 = await createTestTrack(agent, { name: 'Track 2' });

      await createTestSession(agent, { name: 'Session at Track 1', trackId: track1.id });
      await createTestSession(agent, { name: 'Session at Track 2', trackId: track2.id });

      const response = await agent.get(`/api/sessions?trackId=${track1.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Session at Track 1');
    });

    it('should filter by both carId and trackId', async () => {
      const car = await createTestCar(agent);
      const track = await createTestTrack(agent);

      await createTestSession(agent, { name: 'Matching', carId: car.id, trackId: track.id });
      await createTestSession(agent, { name: 'Car Only', carId: car.id });
      await createTestSession(agent, { name: 'Track Only', trackId: track.id });

      const response = await agent.get(`/api/sessions?carId=${car.id}&trackId=${track.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Matching');
    });

    it('should not return other users sessions', async () => {
      await createTestSession(agent, { name: 'User 1 Session' });

      const auth2 = await createAuthenticatedAgent({ username: 'sessionuser2' });
      await createTestSession(auth2.agent, { name: 'User 2 Session' });

      const response = await agent.get('/api/sessions');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('User 1 Session');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/sessions');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return a specific session', async () => {
      const session = await createTestSession(agent, { name: 'My Session' });

      const response = await agent.get(`/api/sessions/${session.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('My Session');
      expect(response.body.id).toBe(session.id);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await agent.get('/api/sessions/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Session not found');
    });

    it('should not return other users session', async () => {
      const session = await createTestSession(agent, { name: 'Private Session' });

      const auth2 = await createAuthenticatedAgent({ username: 'sessionuser3' });
      const response = await auth2.agent.get(`/api/sessions/${session.id}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const session = await createTestSession(agent, { name: 'Test Session' });
      const response = await request(app).get(`/api/sessions/${session.id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/sessions/:id', () => {
    it('should update a session', async () => {
      const session = await createTestSession(agent, { name: 'Old Name' });

      const response = await agent
        .put(`/api/sessions/${session.id}`)
        .send({ name: 'New Name', bestLaptime: '1:44.000' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Name');
      expect(response.body.bestLaptime).toBe('1:44.000');
    });

    it('should partially update a session', async () => {
      const session = await createTestSession(agent, {
        name: 'Test Session',
        type: 'Practice',
        bestLaptime: '1:45.500'
      });

      const response = await agent
        .put(`/api/sessions/${session.id}`)
        .send({ bestLaptime: '1:44.000' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Test Session');
      expect(response.body.type).toBe('Practice');
      expect(response.body.bestLaptime).toBe('1:44.000');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await agent
        .put('/api/sessions/nonexistent-id')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });

    it('should not update other users session', async () => {
      const session = await createTestSession(agent, { name: 'My Session' });

      const auth2 = await createAuthenticatedAgent({ username: 'sessionuser4' });
      const response = await auth2.agent
        .put(`/api/sessions/${session.id}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const session = await createTestSession(agent, { name: 'Test Session' });
      const response = await request(app)
        .put(`/api/sessions/${session.id}`)
        .send({ name: 'New Name' });
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should delete a session', async () => {
      const session = await createTestSession(agent, { name: 'Delete Me' });

      const response = await agent.delete(`/api/sessions/${session.id}`);

      expect(response.status).toBe(204);

      const getResponse = await agent.get(`/api/sessions/${session.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await agent.delete('/api/sessions/nonexistent-id');
      expect(response.status).toBe(404);
    });

    it('should not delete other users session', async () => {
      const session = await createTestSession(agent, { name: 'My Session' });

      const auth2 = await createAuthenticatedAgent({ username: 'sessionuser5' });
      const response = await auth2.agent.delete(`/api/sessions/${session.id}`);

      expect(response.status).toBe(404);

      const getResponse = await agent.get(`/api/sessions/${session.id}`);
      expect(getResponse.status).toBe(200);
    });

    it('should require authentication', async () => {
      const session = await createTestSession(agent, { name: 'Test Session' });
      const response = await request(app).delete(`/api/sessions/${session.id}`);
      expect(response.status).toBe(401);
    });
  });
});
