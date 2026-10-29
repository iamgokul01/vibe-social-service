import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

export const createTestApp = async (): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  return app;
};

export const uniqueEmail = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@vibesocial.test`;

export const superAdminCredentials = () => ({
  email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@vibesocial.com',
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'VibeSocial!2026',
});

export interface Session {
  token: string;
  cookies: string[];
  id: number;
}

export const login = async (
  app: INestApplication,
  email: string,
  password: string,
): Promise<Session> => {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(
      `Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];

  return {
    token: response.body.data.accessToken,
    cookies,
    id: response.body.data.user.id,
  };
};

export const bearer = (session: Session) => ({
  Authorization: `Bearer ${session.token}`,
});

export const deleteUser = async (
  app: INestApplication,
  admin: Session,
  userId: number,
): Promise<void> => {
  await request(app.getHttpServer())
    .delete(`/api/users/${userId}`)
    .set(bearer(admin));
};
