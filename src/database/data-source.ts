import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config();

const port = process.env.DATABASE_PORT
  ? parseInt(process.env.DATABASE_PORT, 10)
  : 5432;

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port,
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'p3_trader',
  entities: [path.resolve(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.resolve(__dirname, 'migrations', '*.{ts,js}')],
});

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'p3_trader',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
