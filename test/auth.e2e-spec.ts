import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bearer,
  createTestApp,
  login,
  superAdminCredentials,
} from './e2e-utils';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a wrong password with 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: superAdminCredentials().email, password: 'not-the-password' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('issues an access token and an httpOnly refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(superAdminCredentials());

    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));

    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('vibesocial_refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('never returns the password hash', async () => {
    const session = await login(
      app,
      superAdminCredentials().email,
      superAdminCredentials().password,
    );

    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(bearer(session));

    expect(response.status).toBe(200);
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('rotates the refresh token and revokes the previous one', async () => {
    const session = await login(
      app,
      superAdminCredentials().email,
      superAdminCredentials().password,
    );

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.cookies);

    expect(refreshed.status).toBe(201);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    const replayed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.cookies);

    expect(replayed.status).toBe(401);
  });

  it('invalidates the session on logout', async () => {
    const session = await login(
      app,
      superAdminCredentials().email,
      superAdminCredentials().password,
    );

    const loggedOut = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', session.cookies);

    expect(loggedOut.status).toBe(201);

    const replayed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', session.cookies);

    expect(replayed.status).toBe(401);
  });

  it('blocks protected routes without a token', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/me');

    expect(response.status).toBe(401);
  });

  it('serves the health probe without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.data.db).toBe('up');
  });
});
