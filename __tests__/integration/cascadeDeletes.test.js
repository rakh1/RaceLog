const request = require('supertest');
const app = require('../../server');
const {
  createAuthenticatedAgent,
  createTestCar,
  createTestTrack,
  createTestSetup,
  createTestSession,
  createTestMaintenance,
  createTestCornerNote,
  createTestTrackNote
} = require('../setup/testHelpers');

describe('Cascade Delete Behavior', () => {
  let agent;

  beforeEach(async () => {
    const auth = await createAuthenticatedAgent();
    agent = auth.agent;
  });

  describe('Deleting a Car', () => {
    it('should delete related setups', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });
      const setup = await createTestSetup(agent, { name: 'Car Setup', carId: car.id });

      // Verify setup exists
      let setupResponse = await agent.get(`/api/setups/${setup.id}`);
      expect(setupResponse.status).toBe(200);

      // Delete car
      await agent.delete(`/api/cars/${car.id}`);

      // Verify setup is deleted
      setupResponse = await agent.get(`/api/setups/${setup.id}`);
      expect(setupResponse.status).toBe(404);
    });

    it('should delete related maintenance tasks', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });
      const maintenance = await createTestMaintenance(agent, {
        name: 'Oil Change',
        carId: car.id
      });

      // Verify maintenance exists
      let maintResponse = await agent.get(`/api/maintenance/${maintenance.id}`);
      expect(maintResponse.status).toBe(200);

      // Delete car
      await agent.delete(`/api/cars/${car.id}`);

      // Verify maintenance is deleted
      maintResponse = await agent.get(`/api/maintenance/${maintenance.id}`);
      expect(maintResponse.status).toBe(404);
    });

    it('should delete related track notes', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });
      const track = await createTestTrack(agent, { name: 'My Track' });
      const trackNote = await createTestTrackNote(agent, {
        carId: car.id,
        trackId: track.id,
        notes: 'Track note for this car'
      });

      // Verify track note exists
      let noteResponse = await agent.get(`/api/track-notes/${trackNote.id}`);
      expect(noteResponse.status).toBe(200);

      // Delete car
      await agent.delete(`/api/cars/${car.id}`);

      // Verify track note is deleted
      noteResponse = await agent.get(`/api/track-notes/${trackNote.id}`);
      expect(noteResponse.status).toBe(404);
    });

    it('should not delete other users related data', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });

      // Create second user with setup for same car ID (shouldn't happen in practice)
      const auth2 = await createAuthenticatedAgent({ username: 'cascadeuser2' });
      const otherCar = await createTestCar(auth2.agent, { name: 'Other Car' });
      const otherSetup = await createTestSetup(auth2.agent, {
        name: 'Other Setup',
        carId: otherCar.id
      });

      // Delete first user's car
      await agent.delete(`/api/cars/${car.id}`);

      // Other user's setup should still exist
      const setupResponse = await auth2.agent.get(`/api/setups/${otherSetup.id}`);
      expect(setupResponse.status).toBe(200);
    });
  });

  describe('Deleting a Track', () => {
    it('should nullify trackId in related setups', async () => {
      const track = await createTestTrack(agent, { name: 'My Track' });
      const setup = await createTestSetup(agent, {
        name: 'Track Setup',
        trackId: track.id
      });

      // Verify setup has trackId
      let setupResponse = await agent.get(`/api/setups/${setup.id}`);
      expect(setupResponse.status).toBe(200);
      expect(setupResponse.body.trackId).toBe(track.id);

      // Delete track
      await agent.delete(`/api/tracks/${track.id}`);

      // Verify setup exists but trackId is null
      setupResponse = await agent.get(`/api/setups/${setup.id}`);
      expect(setupResponse.status).toBe(200);
      expect(setupResponse.body.trackId).toBeNull();
    });

    it('should delete related track notes', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });
      const track = await createTestTrack(agent, { name: 'My Track' });
      const trackNote = await createTestTrackNote(agent, {
        carId: car.id,
        trackId: track.id,
        notes: 'Track notes'
      });

      // Verify track note exists
      let noteResponse = await agent.get(`/api/track-notes/${trackNote.id}`);
      expect(noteResponse.status).toBe(200);

      // Delete track
      await agent.delete(`/api/tracks/${track.id}`);

      // Verify track note is deleted
      noteResponse = await agent.get(`/api/track-notes/${trackNote.id}`);
      expect(noteResponse.status).toBe(404);
    });

    it('should not nullify other users setup trackIds', async () => {
      const track = await createTestTrack(agent, { name: 'My Track' });

      // Create second user with setup
      const auth2 = await createAuthenticatedAgent({ username: 'cascadeuser3' });
      const otherTrack = await createTestTrack(auth2.agent, { name: 'Other Track' });
      const otherSetup = await createTestSetup(auth2.agent, {
        name: 'Other Setup',
        trackId: otherTrack.id
      });

      // Delete first user's track
      await agent.delete(`/api/tracks/${track.id}`);

      // Other user's setup should still have trackId
      const setupResponse = await auth2.agent.get(`/api/setups/${otherSetup.id}`);
      expect(setupResponse.status).toBe(200);
      expect(setupResponse.body.trackId).toBe(otherTrack.id);
    });
  });

  describe('Deleting a Session', () => {
    it('should delete related corner notes', async () => {
      const session = await createTestSession(agent, { name: 'My Session' });
      const cornerNote = await createTestCornerNote(agent, {
        sessionId: session.id,
        cornerName: 'Turn 1',
        field: 'entry',
        value: 'Test entry'
      });

      // Verify corner note exists
      let noteResponse = await agent.get(`/api/corner-notes/${cornerNote.id}`);
      expect(noteResponse.status).toBe(200);

      // Delete session
      await agent.delete(`/api/sessions/${session.id}`);

      // Verify corner note is deleted
      noteResponse = await agent.get(`/api/corner-notes/${cornerNote.id}`);
      expect(noteResponse.status).toBe(404);
    });

    it('should delete all corner notes for a session', async () => {
      const session = await createTestSession(agent, { name: 'My Session' });
      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 1' });
      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 2' });
      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 3' });

      // Verify corner notes exist
      let notesResponse = await agent.get(`/api/corner-notes?sessionId=${session.id}`);
      expect(notesResponse.body).toHaveLength(3);

      // Delete session
      await agent.delete(`/api/sessions/${session.id}`);

      // Verify all corner notes are deleted
      notesResponse = await agent.get('/api/corner-notes');
      expect(notesResponse.body).toHaveLength(0);
    });
  });

  describe('Deleting a User Account', () => {
    it('should delete all user data on account deletion', async () => {
      // Create various data
      const car = await createTestCar(agent, { name: 'My Car' });
      const track = await createTestTrack(agent, { name: 'My Track' });
      await createTestSetup(agent, { name: 'My Setup', carId: car.id, trackId: track.id });
      const session = await createTestSession(agent, { name: 'My Session', carId: car.id, trackId: track.id });
      await createTestMaintenance(agent, { name: 'My Maintenance', carId: car.id });
      await createTestCornerNote(agent, { sessionId: session.id, cornerName: 'Turn 1' });
      await createTestTrackNote(agent, { carId: car.id, trackId: track.id });

      // Delete account
      const auth = await createAuthenticatedAgent({ username: 'deleteuser', password: 'password123' });
      await createTestCar(auth.agent, { name: 'Delete User Car' });

      const deleteResponse = await auth.agent
        .delete('/api/user')
        .send({ password: 'password123' });

      expect(deleteResponse.status).toBe(200);

      // Login as deleted user should fail
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'deleteuser', password: 'password123' });

      expect(loginResponse.status).toBe(401);
    });
  });

  describe('Cross-user isolation', () => {
    it('should maintain data isolation between users', async () => {
      // User 1 creates data
      const car1 = await createTestCar(agent, { name: 'User 1 Car' });
      const track1 = await createTestTrack(agent, { name: 'User 1 Track' });
      const setup1 = await createTestSetup(agent, {
        name: 'User 1 Setup',
        carId: car1.id,
        trackId: track1.id
      });

      // User 2 creates data
      const auth2 = await createAuthenticatedAgent({ username: 'isolateduser' });
      const car2 = await createTestCar(auth2.agent, { name: 'User 2 Car' });
      const track2 = await createTestTrack(auth2.agent, { name: 'User 2 Track' });
      const setup2 = await createTestSetup(auth2.agent, {
        name: 'User 2 Setup',
        carId: car2.id,
        trackId: track2.id
      });

      // User 1 deletes car
      await agent.delete(`/api/cars/${car1.id}`);

      // User 1's setup should be deleted
      const setup1Response = await agent.get(`/api/setups/${setup1.id}`);
      expect(setup1Response.status).toBe(404);

      // User 2's data should be intact
      const setup2Response = await auth2.agent.get(`/api/setups/${setup2.id}`);
      expect(setup2Response.status).toBe(200);
      expect(setup2Response.body.carId).toBe(car2.id);

      const car2Response = await auth2.agent.get(`/api/cars/${car2.id}`);
      expect(car2Response.status).toBe(200);

      const track2Response = await auth2.agent.get(`/api/tracks/${track2.id}`);
      expect(track2Response.status).toBe(200);
    });
  });
});
