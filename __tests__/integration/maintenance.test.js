const request = require('supertest');
const app = require('../../server');
const {
  createAuthenticatedAgent,
  createTestCar,
  createTestMaintenance
} = require('../setup/testHelpers');

describe('Maintenance API', () => {
  let agent;

  beforeEach(async () => {
    const auth = await createAuthenticatedAgent();
    agent = auth.agent;
  });

  describe('POST /api/maintenance', () => {
    it('should create a new maintenance task', async () => {
      const car = await createTestCar(agent);

      const response = await agent
        .post('/api/maintenance')
        .send({
          name: 'Oil Change',
          carId: car.id,
          date: '2024-01-15',
          type: ['Oil Change', 'Filter'],
          description: 'Changed oil and filter',
          mileage: '50000',
          partsUsed: 'Mobil 1 5W-30, K&N Filter',
          notes: 'Next change at 55000 miles'
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Oil Change');
      expect(response.body.carId).toBe(car.id);
      expect(response.body.type).toContain('Oil Change');
      expect(response.body.type).toContain('Filter');
      expect(response.body.id).toBeDefined();
    });

    it('should create maintenance task with default values', async () => {
      const response = await agent
        .post('/api/maintenance')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('');
      expect(response.body.carId).toBeNull();
      expect(response.body.type).toEqual([]);
      expect(response.body.description).toBe('');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/maintenance')
        .send({ name: 'Test Maintenance' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/maintenance', () => {
    it('should return all user maintenance tasks', async () => {
      await createTestMaintenance(agent, { name: 'Task 1' });
      await createTestMaintenance(agent, { name: 'Task 2' });

      const response = await agent.get('/api/maintenance');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should filter by carId', async () => {
      const car1 = await createTestCar(agent, { name: 'Car 1' });
      const car2 = await createTestCar(agent, { name: 'Car 2' });

      await createTestMaintenance(agent, { name: 'Task for Car 1', carId: car1.id });
      await createTestMaintenance(agent, { name: 'Task for Car 2', carId: car2.id });

      const response = await agent.get(`/api/maintenance?carId=${car1.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Task for Car 1');
    });

    it('should not return other users maintenance tasks', async () => {
      await createTestMaintenance(agent, { name: 'User 1 Task' });

      const auth2 = await createAuthenticatedAgent({ username: 'maintuser2' });
      await createTestMaintenance(auth2.agent, { name: 'User 2 Task' });

      const response = await agent.get('/api/maintenance');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('User 1 Task');
    });

    it('should return empty array when no tasks exist', async () => {
      const response = await agent.get('/api/maintenance');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/maintenance');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/maintenance/:id', () => {
    it('should return a specific maintenance task', async () => {
      const task = await createTestMaintenance(agent, { name: 'My Task' });

      const response = await agent.get(`/api/maintenance/${task.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('My Task');
      expect(response.body.id).toBe(task.id);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await agent.get('/api/maintenance/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Maintenance task not found');
    });

    it('should not return other users task', async () => {
      const task = await createTestMaintenance(agent, { name: 'Private Task' });

      const auth2 = await createAuthenticatedAgent({ username: 'maintuser3' });
      const response = await auth2.agent.get(`/api/maintenance/${task.id}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const task = await createTestMaintenance(agent, { name: 'Test Task' });
      const response = await request(app).get(`/api/maintenance/${task.id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/maintenance/:id', () => {
    it('should update a maintenance task', async () => {
      const task = await createTestMaintenance(agent, { name: 'Old Name' });

      const response = await agent
        .put(`/api/maintenance/${task.id}`)
        .send({ name: 'New Name', mileage: '55000' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Name');
      expect(response.body.mileage).toBe('55000');
    });

    it('should preserve id and userId on update', async () => {
      const task = await createTestMaintenance(agent);

      const response = await agent
        .put(`/api/maintenance/${task.id}`)
        .send({ id: 'hacked-id', userId: 'hacked-user' });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(task.id);
      expect(response.body.userId).toBe(task.userId);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await agent
        .put('/api/maintenance/nonexistent-id')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });

    it('should not update other users task', async () => {
      const task = await createTestMaintenance(agent, { name: 'My Task' });

      const auth2 = await createAuthenticatedAgent({ username: 'maintuser4' });
      const response = await auth2.agent
        .put(`/api/maintenance/${task.id}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const task = await createTestMaintenance(agent, { name: 'Test Task' });
      const response = await request(app)
        .put(`/api/maintenance/${task.id}`)
        .send({ name: 'New Name' });
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/maintenance/:id', () => {
    it('should delete a maintenance task', async () => {
      const task = await createTestMaintenance(agent, { name: 'Delete Me' });

      const response = await agent.delete(`/api/maintenance/${task.id}`);

      expect(response.status).toBe(204);

      const getResponse = await agent.get(`/api/maintenance/${task.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await agent.delete('/api/maintenance/nonexistent-id');
      expect(response.status).toBe(404);
    });

    it('should not delete other users task', async () => {
      const task = await createTestMaintenance(agent, { name: 'My Task' });

      const auth2 = await createAuthenticatedAgent({ username: 'maintuser5' });
      const response = await auth2.agent.delete(`/api/maintenance/${task.id}`);

      expect(response.status).toBe(404);

      const getResponse = await agent.get(`/api/maintenance/${task.id}`);
      expect(getResponse.status).toBe(200);
    });

    it('should require authentication', async () => {
      const task = await createTestMaintenance(agent, { name: 'Test Task' });
      const response = await request(app).delete(`/api/maintenance/${task.id}`);
      expect(response.status).toBe(401);
    });
  });
});
