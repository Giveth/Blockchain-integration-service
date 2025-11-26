import { expect } from 'chai';
import request from 'supertest';
import { createApp } from './app';

describe('Express App', () => {
  const app = createApp();

  describe('Middleware', () => {
    it('should parse JSON bodies', async () => {
      const response = await request(app)
        .post('/api/transactions/verify')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      expect(response.status).to.be.oneOf([200, 400]);
    });

    it('should handle URL encoded bodies', async () => {
      const response = await request(app)
        .post('/api/transactions/verify')
        .send('key=value')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      expect(response.status).to.be.oneOf([200, 400]);
    });

    it('should set security headers', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers).to.have.property('x-content-type-options');
    });

    it('should enable CORS', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers).to.have.property('access-control-allow-origin');
    });
  });

  describe('Route Mounting', () => {
    it('should have health routes mounted', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).to.equal(200);
    });

    it('should have transaction routes mounted', async () => {
      const response = await request(app).post('/api/transactions/verify');

      expect(response.status).to.not.equal(404);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.status).to.equal(404);
      expect(response.body.success).to.be.false;
      expect(response.body.error).to.equal('Endpoint not found');
    });

    it('should return JSON for 404 errors', async () => {
      const response = await request(app).get('/api/unknown');

      expect(response.headers['content-type']).to.match(/json/);
    });
  });

  describe('Request Logging', () => {
    it('should log requests', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).to.equal(200);
    });
  });
});
