import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import configuration from '../config/configuration';
import { User } from './entities/user.entity';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { Comment } from './entities/comment.entity';
import { PostView } from './entities/post-view.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog } from './entities/audit-log.entity';
import { InitialSchema1730000000000 } from './migrations/1730000000000-InitialSchema';

loadEnv({ quiet: true });

const appConfig = configuration();

export const entities = [
  User,
  Post,
  PostLike,
  Comment,
  PostView,
  RefreshToken,
  AuditLog,
];

export const migrations = [InitialSchema1730000000000];

export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: appConfig.db.host,
  port: appConfig.db.port,
  username: appConfig.db.username,
  password: appConfig.db.password,
  database: appConfig.db.database,
  charset: 'utf8mb4',
  timezone: 'Z',
  entities,
  migrations,
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: appConfig.db.logging,
  extra: {
    connectionLimit: 10,
  },
};

const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
