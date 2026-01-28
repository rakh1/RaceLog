const request = require('supertest');
const app = require('../../server');
const {
  createAuthenticatedAgent,
  createTestCar,
  createTestTrack,
  createTestSetup
} = require('../setup/testHelpers');

describe('Setups API', () => {
  let agent;

  beforeEach(async () => {
    const auth = await createAuthenticatedAgent();
    agent = auth.agent;
  });

  describe('POST /api/setups', () => {
    it('should create a new setup', async () => {
      const car = await createTestCar(agent);
      const track = await createTestTrack(agent);

      const response = await agent
        .post('/api/setups')
        .send({
          name: 'Race Setup',
          carId: car.id,
          trackId: track.id,
          toeFront: '0.5mm',
          toeRear: '1.0mm',
          camberFront: '-2.5deg',
          camberRear: '-1.5deg'
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Race Setup');
      expect(response.body.carId).toBe(car.id);
      expect(response.body.trackId).toBe(track.id);
      expect(response.body.toeFront).toBe('0.5mm');
      expect(response.body.id).toBeDefined();
    });

    it('should create setup with default values', async () => {
      const response = await agent
        .post('/api/setups')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('');
      expect(response.body.carId).toBeNull();
      expect(response.body.trackId).toBeNull();
      expect(response.body.cornerWeights).toEqual({ fl: 0, fr: 0, rl: 0, rr: 0 });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/setups')
        .send({ name: 'Test Setup' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/setups', () => {
    it('should return all user setups', async () => {
      await createTestSetup(agent, { name: 'Setup 1' });
      await createTestSetup(agent, { name: 'Setup 2' });

      const response = await agent.get('/api/setups');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should filter by carId', async () => {
      const car1 = await createTestCar(agent, { name: 'Car 1' });
      const car2 = await createTestCar(agent, { name: 'Car 2' });

      await createTestSetup(agent, { name: 'Setup for Car 1', carId: car1.id });
      await createTestSetup(agent, { name: 'Setup for Car 2', carId: car2.id });

      const response = await agent.get(`/api/setups?carId=${car1.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Setup for Car 1');
    });

    it('should filter by trackId', async () => {
      const track1 = await createTestTrack(agent, { name: 'Track 1' });
      const track2 = await createTestTrack(agent, { name: 'Track 2' });

      await createTestSetup(agent, { name: 'Setup for Track 1', trackId: track1.id });
      await createTestSetup(agent, { name: 'Setup for Track 2', trackId: track2.id });

      const response = await agent.get(`/api/setups?trackId=${track1.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Setup for Track 1');
    });

    it('should filter by both carId and trackId', async () => {
      const car = await createTestCar(agent);
      const track = await createTestTrack(agent);

      await createTestSetup(agent, { name: 'Matching', carId: car.id, trackId: track.id });
      await createTestSetup(agent, { name: 'Car Only', carId: car.id });
      await createTestSetup(agent, { name: 'Track Only', trackId: track.id });

      const response = await agent.get(`/api/setups?carId=${car.id}&trackId=${track.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Matching');
    });

    it('should not return other users setups', async () => {
      await createTestSetup(agent, { name: 'User 1 Setup' });

      const auth2 = await createAuthenticatedAgent({ username: 'setupuser2' });
      await createTestSetup(auth2.agent, { name: 'User 2 Setup' });

      const response = await agent.get('/api/setups');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('User 1 Setup');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/setups');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/setups/:id', () => {
    it('should return a specific setup', async () => {
      const setup = await createTestSetup(agent, { name: 'My Setup' });

      const response = await agent.get(`/api/setups/${setup.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('My Setup');
      expect(response.body.id).toBe(setup.id);
    });

    it('should return 404 for non-existent setup', async () => {
      const response = await agent.get('/api/setups/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Setup not found');
    });

    it('should not return other users setup', async () => {
      const setup = await createTestSetup(agent, { name: 'Private Setup' });

      const auth2 = await createAuthenticatedAgent({ username: 'setupuser3' });
      const response = await auth2.agent.get(`/api/setups/${setup.id}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const setup = await createTestSetup(agent, { name: 'Test Setup' });
      const response = await request(app).get(`/api/setups/${setup.id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/setups/:id', () => {
    it('should update a setup', async () => {
      const setup = await createTestSetup(agent, { name: 'Old Name' });

      const response = await agent
        .put(`/api/setups/${setup.id}`)
        .send({ name: 'New Name', toeFront: '1.0mm' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Name');
      expect(response.body.toeFront).toBe('1.0mm');
    });

    it('should preserve id and userId on update', async () => {
      const setup = await createTestSetup(agent);

      const response = await agent
        .put(`/api/setups/${setup.id}`)
        .send({ id: 'hacked-id', userId: 'hacked-user' });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(setup.id);
      expect(response.body.userId).toBe(setup.userId);
    });

    it('should return 404 for non-existent setup', async () => {
      const response = await agent
        .put('/api/setups/nonexistent-id')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });

    it('should not update other users setup', async () => {
      const setup = await createTestSetup(agent, { name: 'My Setup' });

      const auth2 = await createAuthenticatedAgent({ username: 'setupuser4' });
      const response = await auth2.agent
        .put(`/api/setups/${setup.id}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const setup = await createTestSetup(agent, { name: 'Test Setup' });
      const response = await request(app)
        .put(`/api/setups/${setup.id}`)
        .send({ name: 'New Name' });
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/setups/:id', () => {
    it('should delete a setup', async () => {
      const setup = await createTestSetup(agent, { name: 'Delete Me' });

      const response = await agent.delete(`/api/setups/${setup.id}`);

      expect(response.status).toBe(204);

      const getResponse = await agent.get(`/api/setups/${setup.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent setup', async () => {
      const response = await agent.delete('/api/setups/nonexistent-id');
      expect(response.status).toBe(404);
    });

    it('should not delete other users setup', async () => {
      const setup = await createTestSetup(agent, { name: 'My Setup' });

      const auth2 = await createAuthenticatedAgent({ username: 'setupuser5' });
      const response = await auth2.agent.delete(`/api/setups/${setup.id}`);

      expect(response.status).toBe(404);

      const getResponse = await agent.get(`/api/setups/${setup.id}`);
      expect(getResponse.status).toBe(200);
    });

    it('should require authentication', async () => {
      const setup = await createTestSetup(agent, { name: 'Test Setup' });
      const response = await request(app).delete(`/api/setups/${setup.id}`);
      expect(response.status).toBe(401);
    });
  });
});
