import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bearer,
  createTestApp,
  deleteUser,
  login,
  superAdminCredentials,
  uniqueEmail,
  type Session,
} from './e2e-utils';

describe('User management and RBAC (e2e)', () => {
  let app: INestApplication;
  let admin: Session;
  let member: Session;
  let memberId: number;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await login(
      app,
      superAdminCredentials().email,
      superAdminCredentials().password,
    );

    const email = uniqueEmail('member');
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set(bearer(admin))
      .send({
        fullName: 'Priya Patel',
        email,
        password: 'MemberPass!2026',
        role: 'MEMBER',
        status: 'ACTIVE',
        jobTitle: 'Community Member',
      });

    expect(created.status).toBe(201);
    memberId = created.body.data.id;
    member = await login(app, email, 'MemberPass!2026');
  });

  afterAll(async () => {
    await deleteUser(app, admin, memberId);
    await app.close();
  });

  it('lets an admin list the member directory', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBeGreaterThan(0);
  });

  it('filters the directory by search term', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users?search=Priya')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.items.length).toBeGreaterThan(0);
    expect(response.body.data.items[0].fullName).toContain('Priya');
  });

  it('filters the directory by role and status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users?role=MEMBER&status=ACTIVE')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    response.body.data.items.forEach((memberRow: { role: string; status: string }) => {
      expect(memberRow.role).toBe('MEMBER');
      expect(memberRow.status).toBe('ACTIVE');
    });
  });

  it('reports member statistics', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users/stats')
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.totalMembers).toBeGreaterThan(0);
    expect(response.body.data.healthyPercent).toBeGreaterThanOrEqual(0);
  });

  it('blocks a member from reading the directory', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users')
      .set(bearer(member));

    expect(response.status).toBe(403);
  });

  it('blocks a member from changing a role', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/users/${admin.id}/role`)
      .set(bearer(member))
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(403);
  });

  it('blocks a member from creating accounts', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .set(bearer(member))
      .send({
        fullName: 'Backdoor',
        email: uniqueEmail('sneaky'),
        password: 'MemberPass!2026',
        role: 'ADMIN',
      });

    expect(response.status).toBe(403);
  });

  it('records a role change in the audit ledger', async () => {
    const email = uniqueEmail('editor');
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set(bearer(admin))
      .send({
        fullName: 'Alex Rivera',
        email,
        password: 'EditorPass!2026',
        role: 'MEMBER',
        status: 'ACTIVE',
      });

    const targetId = created.body.data.id;

    const promoted = await request(app.getHttpServer())
      .patch(`/api/users/${targetId}/role`)
      .set(bearer(admin))
      .send({ role: 'EDITOR' });

    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe('EDITOR');

    const audit = await request(app.getHttpServer())
      .get('/api/audit?action=USER_ROLE_CHANGED')
      .set(bearer(admin));

    expect(audit.status).toBe(200);
    expect(audit.body.data.total).toBeGreaterThan(0);

    await deleteUser(app, admin, targetId);
  });

  it('rejects a duplicate email', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .set(bearer(admin))
      .send({
        fullName: 'Duplicate',
        email: superAdminCredentials().email,
        password: 'MemberPass!2026',
        role: 'MEMBER',
      });

    expect(response.status).toBe(400);
  });

  it('validates the payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .set(bearer(admin))
      .send({ fullName: 'No Email', password: 'short', role: 'NOT_A_ROLE' });

    expect(response.status).toBe(400);
  });
});
