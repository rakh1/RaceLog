const request = require('supertest');
const app = require('../../server');

describe('Authentication API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'newuser', password: 'password123' });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User registered successfully');
    });

    it('should reject registration with missing username', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username and password are required');
    });

    it('should reject registration with missing password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'newuser' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username and password are required');
    });

    it('should reject registration with short username', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'ab', password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username must be at least 3 characters');
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'newuser', password: '12345' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Password must be at least 6 characters');
    });

    it('should reject duplicate username', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'existinguser', password: 'password123' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'existinguser', password: 'password456' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username already exists');
    });

    it('should reject duplicate username case-insensitively', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'CaseUser', password: 'password123' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'caseuser', password: 'password456' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'loginuser', password: 'password123' });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'loginuser', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.username).toBe('loginuser');
    });

    it('should login case-insensitively', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'LOGINUSER', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
    });

    it('should reject login with invalid username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid username or password');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'loginuser', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid username or password');
    });

    it('should reject login with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username and password are required');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/register')
        .send({ username: 'logoutuser', password: 'password123' });

      await agent
        .post('/api/auth/login')
        .send({ username: 'logoutuser', password: 'password123' });

      const response = await agent.post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should clear session after logout', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/register')
        .send({ username: 'sessionuser', password: 'password123' });

      await agent
        .post('/api/auth/login')
        .send({ username: 'sessionuser', password: 'password123' });

      await agent.post('/api/auth/logout');

      const checkResponse = await agent.get('/api/auth/check');
      expect(checkResponse.body.authenticated).toBe(false);
    });
  });

  describe('GET /api/auth/check', () => {
    it('should return authenticated true when logged in', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/register')
        .send({ username: 'checkuser', password: 'password123' });

      await agent
        .post('/api/auth/login')
        .send({ username: 'checkuser', password: 'password123' });

      const response = await agent.get('/api/auth/check');

      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(true);
      expect(response.body.username).toBe('checkuser');
    });

    it('should return authenticated false when not logged in', async () => {
      const response = await request(app).get('/api/auth/check');

      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(false);
    });
  });

  describe('User Account Management', () => {
    let agent;

    beforeEach(async () => {
      agent = request.agent(app);
      await agent
        .post('/api/auth/register')
        .send({ username: 'accountuser', password: 'password123' });
      await agent
        .post('/api/auth/login')
        .send({ username: 'accountuser', password: 'password123' });
    });

    describe('PUT /api/user/username', () => {
      it('should update username', async () => {
        const response = await agent
          .put('/api/user/username')
          .send({ username: 'newusername' });

        expect(response.status).toBe(200);
        expect(response.body.username).toBe('newusername');
      });

      it('should reject short username', async () => {
        const response = await agent
          .put('/api/user/username')
          .send({ username: 'ab' });

        expect(response.status).toBe(400);
      });

      it('should reject duplicate username', async () => {
        await request(app)
          .post('/api/auth/register')
          .send({ username: 'takenname', password: 'password123' });

        const response = await agent
          .put('/api/user/username')
          .send({ username: 'takenname' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Username already exists');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .put('/api/user/username')
          .send({ username: 'newusername' });

        expect(response.status).toBe(401);
      });
    });

    describe('PUT /api/user/password', () => {
      it('should change password with correct current password', async () => {
        const response = await agent
          .put('/api/user/password')
          .send({ currentPassword: 'password123', newPassword: 'newpass456' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Password changed successfully');
      });

      it('should reject with incorrect current password', async () => {
        const response = await agent
          .put('/api/user/password')
          .send({ currentPassword: 'wrongpass', newPassword: 'newpass456' });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Current password is incorrect');
      });

      it('should reject short new password', async () => {
        const response = await agent
          .put('/api/user/password')
          .send({ currentPassword: 'password123', newPassword: '12345' });

        expect(response.status).toBe(400);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .put('/api/user/password')
          .send({ currentPassword: 'password123', newPassword: 'newpass456' });

        expect(response.status).toBe(401);
      });
    });

    describe('DELETE /api/user', () => {
      it('should delete account with correct password', async () => {
        const response = await agent
          .delete('/api/user')
          .send({ password: 'password123' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Account deleted successfully');
      });

      it('should reject with incorrect password', async () => {
        const response = await agent
          .delete('/api/user')
          .send({ password: 'wrongpassword' });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Password is incorrect');
      });

      it('should require password', async () => {
        const response = await agent
          .delete('/api/user')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Password is required to delete account');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .delete('/api/user')
          .send({ password: 'password123' });

        expect(response.status).toBe(401);
      });
    });
  });
});
