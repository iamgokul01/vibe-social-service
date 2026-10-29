import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bearer,
  createTestApp,
  login,
  superAdminCredentials,
  type Session,
} from './e2e-utils';

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let admin: Session;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await login(
      app,
      superAdminCredentials().email,
      superAdminCredentials().password,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the summary shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/analytics/summary?range=30d')
      .set(bearer(admin));

    expect(response.status).toBe(200);

    const summary = response.body.data;
    expect(summary.range).toBe('30d');
    expect(summary.window.days).toBe(30);
    expect(typeof summary.totalLikes).toBe('number');
    expect(typeof summary.totalViews).toBe('number');
    expect(typeof summary.totalPosts).toBe('number');
    expect(summary.benchmark).toBe(8.2);
    expect(typeof summary.tier).toBe('string');
    expect(summary.deltas).toEqual({
      likes: expect.any(Number),
      views: expect.any(Number),
      posts: expect.any(Number),
      engagement: expect.any(Number),
    });
  });

  it('never returns NaN for an empty window', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/analytics/summary?range=today')
      .set(bearer(admin));

    const summary = response.body.data;
    expect(Number.isNaN(summary.engagementRate)).toBe(false);
    expect(Number.isNaN(summary.deltas.likes)).toBe(false);
    expect(Number.isNaN(summary.deltas.views)).toBe(false);
  });

  it('returns a zero filled daily series', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/analytics/timeseries?range=7d')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.series).toHaveLength(8);
    response.body.data.series.forEach((point: { views: number; likes: number }) => {
      expect(Number.isNaN(point.views)).toBe(false);
      expect(Number.isNaN(point.likes)).toBe(false);
    });
  });

  it('reports engagement share for every role', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/analytics/by-role?range=90d')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.roles).toHaveLength(5);
    expect(response.body.data.enforced).toBe(true);

    const total = response.body.data.total;
    const percentages = response.body.data.roles.map(
      (role: { percentage: number }) => role.percentage,
    );

    percentages.forEach((percentage: number) => {
      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    });

    if (total === 0) {
      expect(percentages.every((percentage: number) => percentage === 0)).toBe(true);
    } else {
      const sum = percentages.reduce(
        (accumulator: number, percentage: number) => accumulator + percentage,
        0,
      );
      expect(sum).toBeCloseTo(100, 0);
    }
  });

  it('ranks publications with pagination metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/analytics/top-posts?range=90d&page=1&limit=5')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.page).toBe(1);
    expect(response.body.data.limit).toBe(5);
    expect(Array.isArray(response.body.data.items)).toBe(true);
  });

  it('exports the report as csv', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/analytics/export.csv?range=90d')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('Title');
    expect(response.text).toContain('Engagement %');
  });

  it('blocks a member from reading analytics', async () => {
    const email = `analyst-${Date.now()}@vibesocial.test`;
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set(bearer(admin))
      .send({
        fullName: 'Analyst',
        email,
        password: 'MemberPass!2026',
        role: 'MEMBER',
        status: 'ACTIVE',
      });

    const member = await login(app, email, 'MemberPass!2026');

    const response = await request(app.getHttpServer())
      .get('/api/analytics/summary')
      .set(bearer(member));

    expect(response.status).toBe(403);

    await request(app.getHttpServer())
      .delete(`/api/users/${created.body.data.id}`)
      .set(bearer(admin));
  });
});
