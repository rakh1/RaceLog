const request = require('supertest');
const app = require('../../server');
const {
  createAuthenticatedAgent,
  createTestSession,
  createTestCornerNote
} = require('../setup/testHelpers');

describe('Corner Notes API', () => {
  let agent;
  let session;

  beforeEach(async () => {
    const auth = await createAuthenticatedAgent();
    agent = auth.agent;
    session = await createTestSession(agent, { name: 'Test Session' });
  });

  describe('POST /api/corner-notes (Upsert)', () => {
    it('should create a new corner note', async () => {
      const response = await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'entry',
          value: 'Brake at 100m marker'
        });

      expect(response.status).toBe(201);
      expect(response.body.sessionId).toBe(session.id);
      expect(response.body.cornerName).toBe('Turn 1');
      expect(response.body.entry).toBe('Brake at 100m marker');
      expect(response.body.apex).toBe('');
      expect(response.body.exit).toBe('');
      expect(response.body.id).toBeDefined();
    });

    it('should update existing corner note (upsert)', async () => {
      // Create initial note
      await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'entry',
          value: 'Brake at 100m marker'
        });

      // Update same corner with apex note
      const response = await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'apex',
          value: 'Clip the inside curb'
        });

      expect(response.status).toBe(200);
      expect(response.body.entry).toBe('Brake at 100m marker');
      expect(response.body.apex).toBe('Clip the inside curb');
    });

    it('should create notes for different corners', async () => {
      await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'entry',
          value: 'Note 1'
        });

      const response = await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 2',
          field: 'entry',
          value: 'Note 2'
        });

      expect(response.status).toBe(201);
      expect(response.body.cornerName).toBe('Turn 2');

      const allNotes = await agent.get(`/api/corner-notes?sessionId=${session.id}`);
      expect(allNotes.body).toHaveLength(2);
    });

    it('should reject without sessionId', async () => {
      const response = await agent
        .post('/api/corner-notes')
        .send({
          cornerName: 'Turn 1',
          field: 'entry',
          value: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sessionId and cornerName are required');
    });

    it('should reject without cornerName', async () => {
      const response = await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          field: 'entry',
          value: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sessionId and cornerName are required');
    });

    it('should handle all three fields', async () => {
      // Create with entry
      await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'entry',
          value: 'Entry note'
        });

      // Update with apex
      await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'apex',
          value: 'Apex note'
        });

      // Update with exit
      const response = await agent
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'exit',
          value: 'Exit note'
        });

      expect(response.status).toBe(200);
      expect(response.body.entry).toBe('Entry note');
      expect(response.body.apex).toBe('Apex note');
      expect(response.body.exit).toBe('Exit note');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/corner-notes')
        .send({
          sessionId: session.id,
          cornerName: 'Turn 1',
          field: 'entry',
          value: 'Test'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/corner-notes', () => {
    it('should return all user corner notes', async () => {
      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 1' });
      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 2' });

      const response = await agent.get('/api/corner-notes');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should filter by sessionId', async () => {
      const session2 = await createTestSession(agent, { name: 'Session 2' });

      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 1' });
      await createTestCornerNote(agent, { sessionId: session2.id, cornerName: 'Turn 1' });

      const response = await agent.get(`/api/corner-notes?sessionId=${session.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].sessionId).toBe(session.id);
    });

    it('should not return other users corner notes', async () => {
      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 1' });

      const auth2 = await createAuthenticatedAgent({ username: 'corneruser2' });
      const session2 = await createTestSession(auth2.agent, { name: 'Other Session' });
      await createTestCornerNote(auth2.agent, { sessionId: session2.id, cornerName: 'Turn 1' });

      const response = await agent.get('/api/corner-notes');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/corner-notes');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/corner-notes/:id', () => {
    it('should return a specific corner note', async () => {
      const note = await createTestCornerNote(agent, {
        sessionId: session.id,
        cornerName: 'Turn 1',
        field: 'entry',
        value: 'Test entry'
      });

      const response = await agent.get(`/api/corner-notes/${note.id}`);

      expect(response.status).toBe(200);
      expect(response.body.cornerName).toBe('Turn 1');
      expect(response.body.entry).toBe('Test entry');
    });

    it('should return 404 for non-existent note', async () => {
      const response = await agent.get('/api/corner-notes/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Corner note not found');
    });

    it('should not return other users note', async () => {
      const note = await createTestCornerNote(agent, {
        sessionId: session.id,
        cornerName: 'Turn 1'
      });

      const auth2 = await createAuthenticatedAgent({ username: 'corneruser3' });
      const response = await auth2.agent.get(`/api/corner-notes/${note.id}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const note = await createTestCornerNote(agent, {
        sessionId: session.id,
        cornerName: 'Turn 1'
      });
      const response = await request(app).get(`/api/corner-notes/${note.id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/corner-notes/:id', () => {
    it('should delete a corner note', async () => {
      const note = await createTestCornerNote(agent, {
        sessionId: session.id,
        cornerName: 'Turn 1'
      });

      const response = await agent.delete(`/api/corner-notes/${note.id}`);

      expect(response.status).toBe(204);

      const getResponse = await agent.get(`/api/corner-notes/${note.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent note', async () => {
      const response = await agent.delete('/api/corner-notes/nonexistent-id');
      expect(response.status).toBe(404);
    });

    it('should not delete other users note', async () => {
      const note = await createTestCornerNote(agent, {
        sessionId: session.id,
        cornerName: 'Turn 1'
      });

      const auth2 = await createAuthenticatedAgent({ username: 'corneruser4' });
      const response = await auth2.agent.delete(`/api/corner-notes/${note.id}`);

      expect(response.status).toBe(404);

      const getResponse = await agent.get(`/api/corner-notes/${note.id}`);
      expect(getResponse.status).toBe(200);
    });

    it('should require authentication', async () => {
      const note = await createTestCornerNote(agent, {
        sessionId: session.id,
        cornerName: 'Turn 1'
      });
      const response = await request(app).delete(`/api/corner-notes/${note.id}`);
      expect(response.status).toBe(401);
    });
  });
});
