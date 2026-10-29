import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../database/entities/post.entity';
import { PostLike } from '../../database/entities/post-like.entity';
import { PostView } from '../../database/entities/post-view.entity';
import { Comment } from '../../database/entities/comment.entity';
import {
  buildDayBuckets,
  DateWindow,
  percentChange,
  resolveWindow,
  safeRate,
  toDateKey,
} from '../../common/utils/date-range';
import { paginate } from '../../common/utils/pagination';
import { stripHtml } from '../../common/utils/sanitize';
import {
  Permission,
  ROLE_LABELS,
  ROLE_ORDER,
  Role,
} from '../rbac/roles';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

const ENGAGEMENT_BENCHMARK = 8.2;

interface CountRow {
  total: string | number;
}

interface DayRow {
  day: Date | string;
  total: string | number;
}

interface RoleRow {
  role: Role;
  total: string | number;
}

interface TopPostRow {
  id: number;
  title: string;
  body: string;
  category: string;
  tags: string[] | null;
  image_url: string | null;
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: Date;
  full_name: string;
  role: Role;
  avatar_url: string | null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Post) private readonly postsRepository: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly postLikesRepository: Repository<PostLike>,
    @InjectRepository(PostView)
    private readonly postViewsRepository: Repository<PostView>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
  ) {}

  async summary(range: string) {
    const window = resolveWindow(this.normalizeRange(range));

    const [
      likes,
      views,
      comments,
      posts,
      previousLikes,
      previousViews,
      previousComments,
      previousPosts,
    ] = await Promise.all([
      this.countLikes(window.start, window.end),
      this.countViews(window.start, window.end),
      this.countComments(window.start, window.end),
      this.countPosts(window.start, window.end),
      this.countLikes(window.previousStart, window.previousEnd),
      this.countViews(window.previousStart, window.previousEnd),
      this.countComments(window.previousStart, window.previousEnd),
      this.countPosts(window.previousStart, window.previousEnd),
    ]);

    const interactions = likes + comments;
    const previousInteractions = previousLikes + previousComments;
    const engagementRate = safeRate(interactions, views);
    const previousEngagementRate = safeRate(previousInteractions, previousViews);

    return {
      range: this.normalizeRange(range),
      window: { start: window.start, end: window.end, days: window.days },
      totalLikes: likes,
      totalViews: views,
      totalPosts: posts,
      totalComments: comments,
      engagementRate,
      benchmark: ENGAGEMENT_BENCHMARK,
      tier: this.resolveTier(engagementRate),
      deltas: {
        likes: percentChange(likes, previousLikes),
        views: percentChange(views, previousViews),
        posts: percentChange(posts, previousPosts),
        engagement: Number(
          (engagementRate - previousEngagementRate).toFixed(1),
        ),
      },
    };
  }

  async timeseries(range: string) {
    const window = resolveWindow(this.normalizeRange(range));

    const [viewRows, likeRows] = await Promise.all([
      this.postViewsRepository.query(
        `SELECT DATE(\`viewed_at\`) AS day, COUNT(*) AS total
         FROM \`post_views\`
         WHERE \`viewed_at\` BETWEEN ? AND ?
         GROUP BY DATE(\`viewed_at\`)`,
        [window.start, window.end],
      ) as Promise<DayRow[]>,
      this.postLikesRepository.query(
        `SELECT DATE(\`created_at\`) AS day, COUNT(*) AS total
         FROM \`post_likes\`
         WHERE \`created_at\` BETWEEN ? AND ?
         GROUP BY DATE(\`created_at\`)`,
        [window.start, window.end],
      ) as Promise<DayRow[]>,
    ]);

    const viewsByDay = this.indexByDay(viewRows);
    const likesByDay = this.indexByDay(likeRows);

    const series = buildDayBuckets(window).map((day) => ({
      day,
      views: viewsByDay.get(day) ?? 0,
      likes: likesByDay.get(day) ?? 0,
    }));

    const peak = series.reduce(
      (best, point) => (point.views > best.views ? point : best),
      series[0] ?? { day: '', views: 0, likes: 0 },
    );

    return {
      range: this.normalizeRange(range),
      series,
      peak: {
        day: peak.day,
        views: peak.views,
        likes: peak.likes,
      },
    };
  }

  async byRole(range: string) {
    const window = resolveWindow(this.normalizeRange(range));

    const [likeRows, commentRows] = await Promise.all([
      this.postLikesRepository.query(
        `SELECT u.\`role\` AS role, COUNT(*) AS total
         FROM \`post_likes\` pl
         JOIN \`users\` u ON u.\`id\` = pl.\`user_id\`
         WHERE pl.\`created_at\` BETWEEN ? AND ?
         GROUP BY u.\`role\``,
        [window.start, window.end],
      ) as Promise<RoleRow[]>,
      this.commentsRepository.query(
        `SELECT u.\`role\` AS role, COUNT(*) AS total
         FROM \`comments\` c
         JOIN \`users\` u ON u.\`id\` = c.\`user_id\`
         WHERE c.\`created_at\` BETWEEN ? AND ?
         GROUP BY u.\`role\``,
        [window.start, window.end],
      ) as Promise<RoleRow[]>,
    ]);

    const totals = new Map<Role, number>();

    for (const row of likeRows) {
      totals.set(row.role, (totals.get(row.role) ?? 0) + Number(row.total));
    }

    for (const row of commentRows) {
      totals.set(row.role, (totals.get(row.role) ?? 0) + Number(row.total));
    }

    const grandTotal = Array.from(totals.values()).reduce(
      (sum, value) => sum + value,
      0,
    );

    const roles = ROLE_ORDER.map((role) => {
      const volume = totals.get(role) ?? 0;
      const percentage = grandTotal
        ? Number(((volume / grandTotal) * 100).toFixed(1))
        : 0;

      return {
        role,
        label: ROLE_LABELS[role],
        volume,
        percentage,
      };
    });

    return {
      range: this.normalizeRange(range),
      total: grandTotal,
      roles,
      enforced: true,
    };
  }

  async topPosts(query: AnalyticsQueryDto) {
    const { rows, total } = await this.fetchTopPosts({
      range: query.range,
      category: query.category,
      sort: query.sort,
      limit: query.limit,
      offset: query.skip,
    });

    return paginate(
      rows.map((row) => this.toTopPost(row)),
      total,
      query.page,
      query.limit,
    );
  }

  async topics(range: string) {
    const window = resolveWindow(this.normalizeRange(range));

    const rows = (await this.postsRepository.query(
      `SELECT jt.tag AS tag, COUNT(DISTINCT p.\`id\`) AS postCount
       FROM \`posts\` p
       JOIN JSON_TABLE(p.\`tags\`, '$[*]' COLUMNS (tag VARCHAR(60) PATH '$')) jt
       WHERE p.\`created_at\` BETWEEN ? AND ?
       GROUP BY jt.tag
       ORDER BY postCount DESC, tag ASC`,
      [window.start, window.end],
    )) as { tag: string; postCount: string | number }[];

    return rows.map((row) => ({
      tag: row.tag,
      postCount: Number(row.postCount),
    }));
  }

  async exportCsv(range: string): Promise<string> {
    const { rows } = await this.fetchTopPosts({
      range: this.normalizeRange(range),
      sort: 'engagement',
      limit: 100,
      offset: 0,
    });

    const header = [
      'Title',
      'Author',
      'Role',
      'Category',
      'Published',
      'Total Views',
      'Likes',
      'Comments',
      'Engagement %',
    ];

    const lines = rows.map((row) => {
      const post = this.toTopPost(row);
      return [
        this.csvCell(post.title),
        this.csvCell(post.author.fullName),
        this.csvCell(post.author.role),
        this.csvCell(post.category),
        this.csvCell(new Date(post.createdAt).toISOString()),
        post.viewCount,
        post.likeCount,
        post.commentCount,
        post.engagement,
      ].join(',');
    });

    return [header.join(','), ...lines].join('\n');
  }

  private async fetchTopPosts(options: {
    range: string;
    category?: string;
    sort: 'views' | 'likes' | 'engagement';
    limit: number;
    offset: number;
  }): Promise<{ rows: TopPostRow[]; total: number }> {
    const window = resolveWindow(this.normalizeRange(options.range));
    const orderBy = this.orderExpression(options.sort);

    const params: unknown[] = [window.start, window.end];
    let categoryClause = '';

    if (options.category) {
      categoryClause = ' AND p.`category` = ?';
      params.push(options.category);
    }

    const rows = (await this.postsRepository.query(
      `SELECT p.\`id\`, p.\`title\`, p.\`body\`, p.\`category\`, p.\`tags\`, p.\`image_url\`,
              p.\`like_count\`, p.\`comment_count\`, p.\`view_count\`, p.\`created_at\`,
              u.\`full_name\`, u.\`role\`, u.\`avatar_url\`
       FROM \`posts\` p
       JOIN \`users\` u ON u.\`id\` = p.\`author_id\`
       WHERE p.\`created_at\` BETWEEN ? AND ?${categoryClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, options.limit, options.offset],
    )) as TopPostRow[];

    const countRow = (await this.postsRepository.query(
      `SELECT COUNT(*) AS total
       FROM \`posts\` p
       WHERE p.\`created_at\` BETWEEN ? AND ?${categoryClause}`,
      params,
    )) as CountRow[];

    return { rows, total: Number(countRow[0]?.total ?? 0) };
  }

  private toTopPost(row: TopPostRow) {
    const plainBody = stripHtml(row.body);

    return {
      id: row.id,
      title: row.title,
      summary: plainBody.length > 90 ? `${plainBody.slice(0, 90)}...` : plainBody,
      category: row.category,
      tags: row.tags ?? [],
      imageUrl: row.image_url,
      likeCount: Number(row.like_count),
      commentCount: Number(row.comment_count),
      viewCount: Number(row.view_count),
      engagement: safeRate(
        Number(row.like_count) + Number(row.comment_count),
        Number(row.view_count),
      ),
      createdAt: row.created_at,
      author: {
        fullName: row.full_name,
        role: row.role,
        avatarUrl: row.avatar_url,
      },
    };
  }

  private orderExpression(sort: 'views' | 'likes' | 'engagement'): string {
    if (sort === 'views') return 'p.`view_count` DESC';
    if (sort === 'likes') return 'p.`like_count` DESC';
    return '(p.`view_count` * 0.5 + p.`like_count` * 3 + p.`comment_count` * 5) DESC';
  }

  private csvCell(value: string): string {
    if (value.includes(',') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private indexByDay(rows: DayRow[]): Map<string, number> {
    const map = new Map<string, number>();

    for (const row of rows) {
      const key =
        typeof row.day === 'string' ? row.day.slice(0, 10) : toDateKey(row.day);
      map.set(key, Number(row.total));
    }

    return map;
  }

  private resolveTier(engagementRate: number): string {
    if (engagementRate >= 12) return 'A+';
    if (engagementRate >= 9) return 'A';
    if (engagementRate >= 6) return 'B';
    return 'C';
  }

  private normalizeRange(range: string): 'today' | '7d' | '30d' | '90d' {
    if (range === 'today' || range === '7d' || range === '30d' || range === '90d') {
      return range;
    }
    return '30d';
  }

  private countLikes(start: Date, end: Date): Promise<number> {
    return this.postLikesRepository
      .createQueryBuilder('like')
      .where('like.createdAt BETWEEN :start AND :end', { start, end })
      .getCount();
  }

  private countViews(start: Date, end: Date): Promise<number> {
    return this.postViewsRepository
      .createQueryBuilder('view')
      .where('view.viewedAt BETWEEN :start AND :end', { start, end })
      .getCount();
  }

  private countComments(start: Date, end: Date): Promise<number> {
    return this.commentsRepository
      .createQueryBuilder('comment')
      .where('comment.createdAt BETWEEN :start AND :end', { start, end })
      .getCount();
  }

  private countPosts(start: Date, end: Date): Promise<number> {
    return this.postsRepository
      .createQueryBuilder('post')
      .where('post.createdAt BETWEEN :start AND :end', { start, end })
      .getCount();
  }
}
