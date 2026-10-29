import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Post,
  PostVisibility,
} from '../../database/entities/post.entity';
import { PostLike } from '../../database/entities/post-like.entity';
import { PostView } from '../../database/entities/post-view.entity';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { Role } from '../rbac/roles';
import { paginate } from '../../common/utils/pagination';
import { sanitizePostBody } from '../../common/utils/sanitize';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsDto } from './dto/list-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';

interface FeedPostRow {
  id: number | string;
  title: string;
  body: string;
  category: string;
  tags: string | null;
  visibility: PostVisibility;
  image_url: string | null;
  like_count: number | string;
  comment_count: number | string;
  view_count: number | string;
  created_at: Date;
  updated_at: Date;
  author_id: number | string;
  author_full_name: string;
  author_handle: string;
  author_role: Role;
  author_avatar_url: string | null;
  author_job_title: string | null;
}

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private readonly postsRepository: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly postLikesRepository: Repository<PostLike>,
    @InjectRepository(PostView)
    private readonly postViewsRepository: Repository<PostView>,
    private readonly dataSource: DataSource,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ListPostsDto, viewer: AuthenticatedUser) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query.category) {
      conditions.push('p.`category` = ?');
      params.push(query.category);
    }

    if (query.visibility) {
      conditions.push('p.`visibility` = ?');
      params.push(query.visibility);
    }

    if (query.search) {
      conditions.push('(LOWER(p.`title`) LIKE ? OR LOWER(p.`body`) LIKE ?)');
      const term = `%${query.search.toLowerCase()}%`;
      params.push(term, term);
    }

    let orderBy = 'p.`created_at` DESC';

    if (query.sort === 'announcements') {
      conditions.push('p.`category` = ?');
      params.push('Announcements');
    } else if (query.sort === 'trending') {
      orderBy =
        '(p.`view_count` * 0.5 + p.`like_count` * 3 + p.`comment_count` * 5) DESC, p.`created_at` DESC';
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = (await this.postsRepository.query(
      [
        'SELECT p.`id`, p.`title`, p.`body`, p.`category`, CAST(p.`tags` AS CHAR) AS `tags`,',
        'p.`visibility`, p.`image_url`, p.`like_count`, p.`comment_count`, p.`view_count`,',
        'p.`created_at`, p.`updated_at`,',
        'u.`id` AS `author_id`, u.`full_name` AS `author_full_name`, u.`handle` AS `author_handle`,',
        'u.`role` AS `author_role`, u.`avatar_url` AS `author_avatar_url`, u.`job_title` AS `author_job_title`',
        'FROM `posts` p',
        'JOIN `users` u ON u.`id` = p.`author_id`',
        whereSql,
        `ORDER BY ${orderBy}`,
        'LIMIT ? OFFSET ?',
      ].join(' '),
      [...params, query.limit, query.skip],
    )) as FeedPostRow[];

    const countRow = (await this.postsRepository.query(
      [
        'SELECT COUNT(*) AS `total`',
        'FROM `posts` p',
        'JOIN `users` u ON u.`id` = p.`author_id`',
        whereSql,
      ].join(' '),
      params,
    )) as { total: string | number }[];

    const total = Number(countRow[0]?.total ?? 0);
    const likeIds = await this.likedPostIds(
      rows.map((row) => Number(row.id)),
      viewer.id,
    );

    return paginate(
      rows.map((row) => this.toFeedRow(row, likeIds.has(Number(row.id)))),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: number, viewer: AuthenticatedUser) {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: { author: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const likeIds = await this.likedPostIds([post.id], viewer.id);
    return this.toFeedPost(post, likeIds.has(post.id));
  }

  async create(dto: CreatePostDto, actor: AuthenticatedUser) {
    const post = this.postsRepository.create({
      authorId: actor.id,
      title: dto.title.trim(),
      body: sanitizePostBody(dto.body.trim()),
      category: dto.category,
      tags: this.normalizeTags(dto.tags),
      visibility: dto.visibility ?? PostVisibility.PUBLIC,
      imageUrl: dto.imageUrl ?? null,
      likeCount: 0,
      commentCount: 0,
      viewCount: 0,
    });

    const saved = await this.postsRepository.save(post);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.POST_CREATED,
      targetType: 'post',
      targetId: saved.id,
    });

    return this.toFeedPost(saved, false);
  }

  async update(id: number, dto: UpdatePostDto, actor: AuthenticatedUser) {
    const post = await this.findRaw(id);
    this.assertCanModify(post, actor);

    if (dto.title !== undefined) post.title = dto.title.trim();
    if (dto.body !== undefined) post.body = sanitizePostBody(dto.body.trim());
    if (dto.category !== undefined) post.category = dto.category;
    if (dto.tags !== undefined) post.tags = this.normalizeTags(dto.tags);
    if (dto.visibility !== undefined) post.visibility = dto.visibility;
    if (dto.imageUrl !== undefined) post.imageUrl = dto.imageUrl;

    const saved = await this.postsRepository.save(post);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.POST_UPDATED,
      targetType: 'post',
      targetId: saved.id,
    });

    return this.toFeedPost(saved, false);
  }

  async remove(id: number, actor: AuthenticatedUser) {
    const post = await this.findRaw(id);
    this.assertCanModify(post, actor);

    await this.postsRepository.remove(post);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.POST_DELETED,
      targetType: 'post',
      targetId: id,
    });

    return { deleted: true };
  }

  async toggleLike(postId: number, actor: AuthenticatedUser) {
    const post = await this.findRaw(postId);

    const result = await this.dataSource.transaction(async (manager) => {
      const insertResult = await manager.query(
        'INSERT IGNORE INTO `post_likes` (`post_id`, `user_id`, `created_at`) VALUES (?, ?, NOW())',
        [postId, actor.id],
      );

      const liked = insertResult.affectedRows === 1;

      if (!liked) {
        await manager.query(
          'DELETE FROM `post_likes` WHERE `post_id` = ? AND `user_id` = ?',
          [postId, actor.id],
        );
      }

      await manager.query(
        'UPDATE `posts` SET `like_count` = (SELECT COUNT(*) FROM `post_likes` WHERE `post_id` = ?) WHERE `id` = ?',
        [postId, postId],
      );

      const rows = await manager.query(
        'SELECT `like_count` FROM `posts` WHERE `id` = ?',
        [postId],
      );

      return { liked, likeCount: Number(rows[0]?.like_count ?? 0) };
    });

    return { postId, ...result };
  }

  async recordView(postId: number, actor: AuthenticatedUser) {
    const post = await this.findRaw(postId);

    await this.postViewsRepository.save(
      this.postViewsRepository.create({
        postId: post.id,
        userId: actor.id,
        viewedAt: new Date(),
      }),
    );

    await this.postsRepository.increment({ id: postId }, 'viewCount', 1);

    return { postId, views: post.viewCount + 1 };
  }

  async trendingTopics(limit = 6) {
    const rows = await this.postsRepository.query(
      `SELECT jt.tag AS tag, COUNT(DISTINCT p.id) AS postCount
       FROM posts p
       JOIN JSON_TABLE(p.tags, '$[*]' COLUMNS (tag VARCHAR(60) PATH '$')) jt
       GROUP BY jt.tag
       ORDER BY postCount DESC, tag ASC
       LIMIT ?`,
      [limit],
    );

    return rows.map((row: { tag: string; postCount: string | number }) => ({
      tag: row.tag,
      postCount: Number(row.postCount),
    }));
  }

  private async findRaw(id: number): Promise<Post> {
    const post = await this.postsRepository.findOne({ where: { id } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  private assertCanModify(post: Post, actor: AuthenticatedUser): void {
    const owns = post.authorId === actor.id;
    const elevated =
      actor.role === Role.SUPER_ADMIN ||
      actor.role === Role.ADMIN ||
      actor.role === Role.MODERATOR;

    if (!owns && !elevated) {
      throw new ForbiddenException('You can only modify your own posts');
    }
  }

  private async likedPostIds(postIds: number[], userId: number): Promise<Set<number>> {
    if (!postIds.length) return new Set<number>();

    const likes = await this.postLikesRepository.find({
      where: postIds.map((postId) => ({ postId, userId })),
      select: { postId: true },
    });

    return new Set(likes.map((like) => like.postId));
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags?.length) return [];

    const cleaned = tags
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter((tag) => tag.length > 0)
      .map((tag) => (tag.length > 60 ? tag.slice(0, 60) : tag));

    return Array.from(new Set(cleaned)).slice(0, 6);
  }

  private toFeedRow(row: FeedPostRow, likedByViewer: boolean) {
    let tags: string[] = [];

    try {
      tags = row.tags ? (JSON.parse(row.tags) as string[]) : [];
    } catch {
      tags = [];
    }

    return {
      id: Number(row.id),
      title: row.title,
      body: row.body,
      category: row.category,
      tags,
      visibility: row.visibility,
      imageUrl: row.image_url,
      likeCount: Number(row.like_count),
      commentCount: Number(row.comment_count),
      viewCount: Number(row.view_count),
      likedByViewer,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: {
        id: Number(row.author_id),
        fullName: row.author_full_name,
        handle: row.author_handle,
        role: row.author_role,
        avatarUrl: row.author_avatar_url,
        jobTitle: row.author_job_title,
      },
    };
  }

  private toFeedPost(post: Post, likedByViewer: boolean) {
    return {
      id: post.id,
      title: post.title,
      body: post.body,
      category: post.category,
      tags: post.tags ?? [],
      visibility: post.visibility,
      imageUrl: post.imageUrl,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      viewCount: post.viewCount,
      likedByViewer,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: post.author
        ? {
            id: post.author.id,
            fullName: post.author.fullName,
            handle: post.author.handle,
            role: post.author.role,
            avatarUrl: post.author.avatarUrl,
            jobTitle: post.author.jobTitle,
          }
        : null,
    };
  }
}
