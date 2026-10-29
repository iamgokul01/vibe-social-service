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

describe('Posts and likes (e2e)', () => {
  let app: INestApplication;
  let admin: Session;
  let member: Session;
  let memberId: number;
  let postId: number;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await login(
      app,
      superAdminCredentials().email,
      superAdminCredentials().password,
    );

    const email = uniqueEmail('liker');
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set(bearer(admin))
      .send({
        fullName: 'Alex Rivera',
        email,
        password: 'MemberPass!2026',
        role: 'EDITOR',
        status: 'ACTIVE',
      });

    memberId = created.body.data.id;
    member = await login(app, email, 'MemberPass!2026');
  });

  afterAll(async () => {
    await deleteUser(app, admin, memberId);
    await app.close();
  });

  it('publishes a post', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/posts')
      .set(bearer(member))
      .send({
        title: 'Terra Design System v2.0 Guidelines',
        body: 'Excited to unveil the updated design system.',
        category: 'Design Systems',
        tags: ['#DesignSystem', 'Community'],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe('Terra Design System v2.0 Guidelines');
    expect(response.body.data.tags).toEqual(['DesignSystem', 'Community']);
    expect(response.body.data.likeCount).toBe(0);

    postId = response.body.data.id;
  });

  it('lists the post in the feed', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/posts?sort=latest')
      .set(bearer(member));

    expect(response.status).toBe(200);
    expect(response.body.data.items.some((post: { id: number }) => post.id === postId)).toBe(
      true,
    );
  });

  it('sorts the feed by trending engagement index', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/posts?sort=trending&limit=20')
      .set(bearer(member));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.items)).toBe(true);
    expect(response.body.data.items.some((post: { id: number }) => post.id === postId)).toBe(
      true,
    );
  });

  it('sorts the feed by announcements', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/posts?sort=announcements')
      .set(bearer(member));

    expect(response.status).toBe(200);
    response.body.data.items.forEach((post: { category: string }) => {
      expect(post.category).toBe('Announcements');
    });
  });

  it('filters the feed by search term', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/posts?search=Terra%20Design%20System&sort=latest')
      .set(bearer(member));

    expect(response.status).toBe(200);
    expect(response.body.data.items.length).toBeGreaterThan(0);
  });

  it('toggles a like idempotently', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/posts/${postId}/like`)
      .set(bearer(member));

    expect(first.status).toBe(201);
    expect(first.body.data.liked).toBe(true);
    expect(first.body.data.likeCount).toBe(1);

    const second = await request(app.getHttpServer())
      .post(`/api/posts/${postId}/like`)
      .set(bearer(member));

    expect(second.status).toBe(201);
    expect(second.body.data.liked).toBe(false);
    expect(second.body.data.likeCount).toBe(0);

    const third = await request(app.getHttpServer())
      .post(`/api/posts/${postId}/like`)
      .set(bearer(member));

    expect(third.body.data.liked).toBe(true);
    expect(third.body.data.likeCount).toBe(1);
  });

  it('records a view', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/posts/${postId}/view`)
      .set(bearer(member));

    expect(response.status).toBe(201);
    expect(response.body.data.views).toBeGreaterThan(0);
  });

  it('adds a comment', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/posts/${postId}/comments`)
      .set(bearer(member))
      .send({ body: 'Love the new component library.' });

    expect(response.status).toBe(201);
    expect(response.body.data.body).toBe('Love the new component library.');

    const list = await request(app.getHttpServer())
      .get(`/api/posts/${postId}/comments`)
      .set(bearer(member));

    expect(list.body.data.length).toBeGreaterThan(0);
  });

  it('lets an admin moderate a post it does not own', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${postId}`)
      .set(bearer(admin))
      .send({ title: 'Moderated title' });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Moderated title');
  });

  it('blocks an editor from editing a post they do not own', async () => {
    const other = await request(app.getHttpServer())
      .post('/api/posts')
      .set(bearer(admin))
      .send({
        title: 'Admin owned post',
        body: 'Owned by the admin.',
        category: 'Announcements',
      });

    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${other.body.data.id}`)
      .set(bearer(member))
      .send({ title: 'Hijacked' });

    expect(response.status).toBe(403);
  });

  it('keeps rich text formatting but strips unsafe markup', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/posts')
      .set(bearer(member))
      .send({
        title: 'Formatted announcement',
        body: '<p>Safe <strong>bold</strong> and <em>italic</em></p><script>alert("xss")</script><img src="x" onerror="alert(1)">',
        category: 'Security & Safety',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.body).toContain('<strong>bold</strong>');
    expect(response.body.data.body).toContain('<em>italic</em>');
    expect(response.body.data.body).not.toContain('<script');
    expect(response.body.data.body).not.toContain('onerror');
  });

  it('removes a post', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/posts/${postId}`)
      .set(bearer(admin));

    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toBe(true);
  });
});
