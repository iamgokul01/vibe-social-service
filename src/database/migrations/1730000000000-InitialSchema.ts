import { MigrationInterface, QueryRunner } from 'typeorm';

const foreignKeysEnabled = () => process.env.DB_FOREIGN_KEYS !== 'false';

export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`full_name\` varchar(120) NOT NULL,
        \`email\` varchar(190) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`handle\` varchar(60) NOT NULL,
        \`role\` enum('SUPER_ADMIN','ADMIN','MODERATOR','EDITOR','MEMBER') NOT NULL DEFAULT 'MEMBER',
        \`status\` enum('ACTIVE','PENDING','INACTIVE') NOT NULL DEFAULT 'PENDING',
        \`job_title\` varchar(120) NULL,
        \`division\` varchar(120) NULL,
        \`avatar_url\` varchar(500) NULL,
        \`last_active_at\` datetime NULL,
        \`invite_sent\` tinyint NOT NULL DEFAULT 0,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_users_email\` (\`email\`),
        UNIQUE KEY \`UQ_users_handle\` (\`handle\`),
        KEY \`IDX_users_role\` (\`role\`),
        KEY \`IDX_users_status\` (\`status\`),
        KEY \`IDX_users_last_active_at\` (\`last_active_at\`),
        KEY \`IDX_users_status_role\` (\`status\`, \`role\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`posts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`author_id\` int NOT NULL,
        \`title\` varchar(200) NOT NULL,
        \`body\` text NOT NULL,
        \`category\` varchar(60) NOT NULL,
        \`tags\` json NOT NULL,
        \`visibility\` enum('PUBLIC','MEMBERS_ONLY') NOT NULL DEFAULT 'PUBLIC',
        \`image_url\` varchar(500) NULL,
        \`like_count\` int NOT NULL DEFAULT 0,
        \`comment_count\` int NOT NULL DEFAULT 0,
        \`view_count\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_posts_author_id\` (\`author_id\`),
        KEY \`IDX_posts_created_at\` (\`created_at\`),
        KEY \`IDX_posts_category\` (\`category\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`post_likes\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`post_id\` int NOT NULL,
        \`user_id\` int NOT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_post_likes_post_user\` (\`post_id\`, \`user_id\`),
        KEY \`IDX_post_likes_user_id\` (\`user_id\`),
        KEY \`IDX_post_likes_post_id\` (\`post_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`comments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`post_id\` int NOT NULL,
        \`user_id\` int NOT NULL,
        \`body\` text NOT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_comments_post_id\` (\`post_id\`),
        KEY \`IDX_comments_user_id\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`post_views\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`post_id\` int NOT NULL,
        \`user_id\` int NULL,
        \`viewed_at\` datetime NOT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_post_views_post_viewed\` (\`post_id\`, \`viewed_at\`),
        KEY \`IDX_post_views_user_id\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`token_hash\` char(64) NOT NULL,
        \`expires_at\` datetime NOT NULL,
        \`revoked_at\` datetime NULL,
        \`replaced_by\` int NULL,
        \`user_agent\` varchar(255) NULL,
        \`ip\` varchar(64) NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_refresh_tokens_token_hash\` (\`token_hash\`),
        KEY \`IDX_refresh_tokens_user_id\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`audit_logs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`actor_id\` int NULL,
        \`action\` varchar(80) NOT NULL,
        \`target_type\` varchar(40) NULL,
        \`target_id\` int NULL,
        \`meta\` text NULL,
        \`ip\` varchar(64) NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_audit_logs_action\` (\`action\`),
        KEY \`IDX_audit_logs_created_at\` (\`created_at\`),
        KEY \`IDX_audit_logs_actor_id\` (\`actor_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (!foreignKeysEnabled()) return;

    await queryRunner.query(`
      ALTER TABLE \`posts\`
        ADD CONSTRAINT \`FK_posts_author_id\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE \`post_likes\`
        ADD CONSTRAINT \`FK_post_likes_post_id\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE,
        ADD CONSTRAINT \`FK_post_likes_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE \`comments\`
        ADD CONSTRAINT \`FK_comments_post_id\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE,
        ADD CONSTRAINT \`FK_comments_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE \`post_views\`
        ADD CONSTRAINT \`FK_post_views_post_id\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON DELETE CASCADE,
        ADD CONSTRAINT \`FK_post_views_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`refresh_tokens\`
        ADD CONSTRAINT \`FK_refresh_tokens_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE \`audit_logs\`
        ADD CONSTRAINT \`FK_audit_logs_actor_id\` FOREIGN KEY (\`actor_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `audit_logs`');
    await queryRunner.query('DROP TABLE IF EXISTS `refresh_tokens`');
    await queryRunner.query('DROP TABLE IF EXISTS `post_views`');
    await queryRunner.query('DROP TABLE IF EXISTS `comments`');
    await queryRunner.query('DROP TABLE IF EXISTS `post_likes`');
    await queryRunner.query('DROP TABLE IF EXISTS `posts`');
    await queryRunner.query('DROP TABLE IF EXISTS `users`');
  }
}
