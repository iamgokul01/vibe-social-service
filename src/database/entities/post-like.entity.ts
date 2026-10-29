import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Post } from './post.entity';
import { User } from './user.entity';

@Entity('post_likes')
@Unique('UQ_post_likes_post_user', ['postId', 'userId'])
@Index('IDX_post_likes_user_id', ['userId'])
export class PostLike {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'post_id', type: 'int' })
  postId: number;

  @ManyToOne(() => Post, (post) => post.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
