import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../../database/entities/comment.entity';
import { Post } from '../../database/entities/post.entity';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Post) private readonly postsRepository: Repository<Post>,
  ) {}

  async list(postId: number) {
    const post = await this.postsRepository.findOne({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comments = await this.commentsRepository.find({
      where: { postId },
      order: { createdAt: 'ASC' },
      relations: { user: true },
    });

    return comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      author: {
        id: comment.user.id,
        fullName: comment.user.fullName,
        handle: comment.user.handle,
        role: comment.user.role,
        avatarUrl: comment.user.avatarUrl,
      },
    }));
  }

  async create(postId: number, dto: CreateCommentDto, actor: AuthenticatedUser) {
    const post = await this.postsRepository.findOne({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = await this.commentsRepository.save(
      this.commentsRepository.create({
        postId,
        userId: actor.id,
        body: dto.body.trim(),
      }),
    );

    await this.postsRepository.increment({ id: postId }, 'commentCount', 1);

    const saved = await this.commentsRepository.findOne({
      where: { id: comment.id },
      relations: { user: true },
    });

    return {
      id: saved!.id,
      body: saved!.body,
      createdAt: saved!.createdAt,
      author: {
        id: saved!.user.id,
        fullName: saved!.user.fullName,
        handle: saved!.user.handle,
        role: saved!.user.role,
        avatarUrl: saved!.user.avatarUrl,
      },
    };
  }

  async remove(id: number, actor: AuthenticatedUser) {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { post: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const owns = comment.userId === actor.id;
    const elevated =
      actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN' || actor.role === 'MODERATOR';

    if (!owns && !elevated) {
      throw new ForbiddenException('You can only remove your own comments');
    }

    await this.commentsRepository.remove(comment);
    await this.postsRepository.decrement({ id: comment.postId }, 'commentCount', 1);

    return { deleted: true };
  }
}
