const request = require('supertest');
const app = require('../../server');
const { createAuthenticatedAgent, createTestTrack } = require('../setup/testHelpers');

describe('Tracks API', () => {
  let agent;

  beforeEach(async () => {
    const auth = await createAuthenticatedAgent();
    agent = auth.agent;
  });

  describe('POST /api/tracks', () => {
    it('should create a new track', async () => {
      const response = await agent
        .post('/api/tracks')
        .send({
          name: 'Laguna Seca',
          location: 'Monterey, CA',
          length: '3.602 km',
          corners: [{ name: 'Turn 1' }, { name: 'Corkscrew' }]
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Laguna Seca');
      expect(response.body.location).toBe('Monterey, CA');
      expect(response.body.length).toBe('3.602 km');
      expect(response.body.corners).toHaveLength(2);
      expect(response.body.id).toBeDefined();
    });

    it('should create track with empty fields', async () => {
      const response = await agent
        .post('/api/tracks')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('');
      expect(response.body.location).toBe('');
      expect(response.body.corners).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/tracks')
        .send({ name: 'Test Track' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/tracks', () => {
    it('should return all user tracks', async () => {
      await createTestTrack(agent, { name: 'Track 1' });
      await createTestTrack(agent, { name: 'Track 2' });

      const response = await agent.get('/api/tracks');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.map(t => t.name)).toContain('Track 1');
      expect(response.body.map(t => t.name)).toContain('Track 2');
    });

    it('should return empty array when no tracks exist', async () => {
      const response = await agent.get('/api/tracks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should not return other users tracks', async () => {
      await createTestTrack(agent, { name: 'User 1 Track' });

      const auth2 = await createAuthenticatedAgent({ username: 'trackuser2' });
      await createTestTrack(auth2.agent, { name: 'User 2 Track' });

      const response = await agent.get('/api/tracks');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('User 1 Track');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/tracks');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/tracks/:id', () => {
    it('should return a specific track', async () => {
      const track = await createTestTrack(agent, { name: 'My Track' });

      const response = await agent.get(`/api/tracks/${track.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('My Track');
      expect(response.body.id).toBe(track.id);
    });

    it('should return 404 for non-existent track', async () => {
      const response = await agent.get('/api/tracks/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Track not found');
    });

    it('should not return other users track', async () => {
      const track = await createTestTrack(agent, { name: 'Private Track' });

      const auth2 = await createAuthenticatedAgent({ username: 'trackuser3' });
      const response = await auth2.agent.get(`/api/tracks/${track.id}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const track = await createTestTrack(agent, { name: 'Test Track' });
      const response = await request(app).get(`/api/tracks/${track.id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/tracks/:id', () => {
    it('should update a track', async () => {
      const track = await createTestTrack(agent, { name: 'Old Name' });

      const response = await agent
        .put(`/api/tracks/${track.id}`)
        .send({ name: 'New Name', location: 'New Location' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Name');
      expect(response.body.location).toBe('New Location');
    });

    it('should partially update a track', async () => {
      const track = await createTestTrack(agent, {
        name: 'Test Track',
        location: 'Original Location'
      });

      const response = await agent
        .put(`/api/tracks/${track.id}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
      expect(response.body.location).toBe('Original Location');
    });

    it('should update corners', async () => {
      const track = await createTestTrack(agent, {
        name: 'Test Track',
        corners: [{ name: 'Turn 1' }]
      });

      const response = await agent
        .put(`/api/tracks/${track.id}`)
        .send({ corners: [{ name: 'Turn 1' }, { name: 'Turn 2' }, { name: 'Turn 3' }] });

      expect(response.status).toBe(200);
      expect(response.body.corners).toHaveLength(3);
    });

    it('should return 404 for non-existent track', async () => {
      const response = await agent
        .put('/api/tracks/nonexistent-id')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });

    it('should not update other users track', async () => {
      const track = await createTestTrack(agent, { name: 'My Track' });

      const auth2 = await createAuthenticatedAgent({ username: 'trackuser4' });
      const response = await auth2.agent
        .put(`/api/tracks/${track.id}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const track = await createTestTrack(agent, { name: 'Test Track' });
      const response = await request(app)
        .put(`/api/tracks/${track.id}`)
        .send({ name: 'New Name' });
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/tracks/:id', () => {
    it('should delete a track', async () => {
      const track = await createTestTrack(agent, { name: 'Delete Me' });

      const response = await agent.delete(`/api/tracks/${track.id}`);

      expect(response.status).toBe(204);

      const getResponse = await agent.get(`/api/tracks/${track.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent track', async () => {
      const response = await agent.delete('/api/tracks/nonexistent-id');
      expect(response.status).toBe(404);
    });

    it('should not delete other users track', async () => {
      const track = await createTestTrack(agent, { name: 'My Track' });

      const auth2 = await createAuthenticatedAgent({ username: 'trackuser5' });
      const response = await auth2.agent.delete(`/api/tracks/${track.id}`);

      expect(response.status).toBe(404);

      // Verify track still exists for original user
      const getResponse = await agent.get(`/api/tracks/${track.id}`);
      expect(getResponse.status).toBe(200);
    });

    it('should require authentication', async () => {
      const track = await createTestTrack(agent, { name: 'Test Track' });
      const response = await request(app).delete(`/api/tracks/${track.id}`);
      expect(response.status).toBe(401);
    });
  });
});
