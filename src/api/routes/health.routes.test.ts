import { expect } from 'chai';
import request from 'supertest';
import { createApp } from '../app';

describe('Health Routes', () => {
  const app = createApp();

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.status).to.equal('healthy');
      expect(response.body.timestamp).to.exist;
      expect(response.body.environment).to.exist;
      expect(response.body.version).to.exist;
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers['content-type']).to.match(/json/);
    });
  });
});
