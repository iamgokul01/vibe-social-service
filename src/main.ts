import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const validation = validateEnv();

  if (!validation.valid) {
    logger.error('Invalid environment configuration');
    validation.errors.forEach((error) => logger.error(`- ${error}`));
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { cors: false });
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configService.get<string[]>('corsOrigins'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (configService.get<boolean>('trustProxy')) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VibeSocial API')
    .setDescription(
      'Role-based social analytics platform: authentication, member management, community feed and post analytics.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);

  logger.log(`VibeSocial API listening on http://localhost:${port}/api`);
  logger.log(`API documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
