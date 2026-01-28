const request = require('supertest');
const app = require('../../server');
const { createAuthenticatedAgent, createTestCar } = require('../setup/testHelpers');

describe('Cars API', () => {
  let agent;

  beforeEach(async () => {
    const auth = await createAuthenticatedAgent();
    agent = auth.agent;
  });

  describe('POST /api/cars', () => {
    it('should create a new car', async () => {
      const response = await agent
        .post('/api/cars')
        .send({
          name: 'Mazda MX-5',
          manufacturer: 'Mazda',
          series: 'Spec Miata'
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Mazda MX-5');
      expect(response.body.manufacturer).toBe('Mazda');
      expect(response.body.series).toBe('Spec Miata');
      expect(response.body.id).toBeDefined();
    });

    it('should create car with empty fields', async () => {
      const response = await agent
        .post('/api/cars')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('');
      expect(response.body.manufacturer).toBe('');
      expect(response.body.series).toBe('');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/cars')
        .send({ name: 'Test Car' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/cars', () => {
    it('should return all user cars', async () => {
      await createTestCar(agent, { name: 'Car 1' });
      await createTestCar(agent, { name: 'Car 2' });

      const response = await agent.get('/api/cars');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.map(c => c.name)).toContain('Car 1');
      expect(response.body.map(c => c.name)).toContain('Car 2');
    });

    it('should return empty array when no cars exist', async () => {
      const response = await agent.get('/api/cars');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should not return other users cars', async () => {
      await createTestCar(agent, { name: 'User 1 Car' });

      const auth2 = await createAuthenticatedAgent({ username: 'otheruser' });
      await createTestCar(auth2.agent, { name: 'User 2 Car' });

      const response = await agent.get('/api/cars');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('User 1 Car');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/cars');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/cars/:id', () => {
    it('should return a specific car', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });

      const response = await agent.get(`/api/cars/${car.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('My Car');
      expect(response.body.id).toBe(car.id);
    });

    it('should return 404 for non-existent car', async () => {
      const response = await agent.get('/api/cars/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Car not found');
    });

    it('should not return other users car', async () => {
      const car = await createTestCar(agent, { name: 'Private Car' });

      const auth2 = await createAuthenticatedAgent({ username: 'otheruser2' });
      const response = await auth2.agent.get(`/api/cars/${car.id}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const car = await createTestCar(agent, { name: 'Test Car' });
      const response = await request(app).get(`/api/cars/${car.id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/cars/:id', () => {
    it('should update a car', async () => {
      const car = await createTestCar(agent, { name: 'Old Name' });

      const response = await agent
        .put(`/api/cars/${car.id}`)
        .send({ name: 'New Name', manufacturer: 'New Manufacturer' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Name');
      expect(response.body.manufacturer).toBe('New Manufacturer');
    });

    it('should partially update a car', async () => {
      const car = await createTestCar(agent, {
        name: 'Test Car',
        manufacturer: 'Original Manufacturer'
      });

      const response = await agent
        .put(`/api/cars/${car.id}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
      expect(response.body.manufacturer).toBe('Original Manufacturer');
    });

    it('should return 404 for non-existent car', async () => {
      const response = await agent
        .put('/api/cars/nonexistent-id')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });

    it('should not update other users car', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });

      const auth2 = await createAuthenticatedAgent({ username: 'otheruser3' });
      const response = await auth2.agent
        .put(`/api/cars/${car.id}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const car = await createTestCar(agent, { name: 'Test Car' });
      const response = await request(app)
        .put(`/api/cars/${car.id}`)
        .send({ name: 'New Name' });
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/cars/:id', () => {
    it('should delete a car', async () => {
      const car = await createTestCar(agent, { name: 'Delete Me' });

      const response = await agent.delete(`/api/cars/${car.id}`);

      expect(response.status).toBe(204);

      const getResponse = await agent.get(`/api/cars/${car.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent car', async () => {
      const response = await agent.delete('/api/cars/nonexistent-id');
      expect(response.status).toBe(404);
    });

    it('should not delete other users car', async () => {
      const car = await createTestCar(agent, { name: 'My Car' });

      const auth2 = await createAuthenticatedAgent({ username: 'otheruser4' });
      const response = await auth2.agent.delete(`/api/cars/${car.id}`);

      expect(response.status).toBe(404);

      // Verify car still exists for original user
      const getResponse = await agent.get(`/api/cars/${car.id}`);
      expect(getResponse.status).toBe(200);
    });

    it('should require authentication', async () => {
      const car = await createTestCar(agent, { name: 'Test Car' });
      const response = await request(app).delete(`/api/cars/${car.id}`);
      expect(response.status).toBe(401);
    });
  });
});
