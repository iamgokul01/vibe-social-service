import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../rbac/roles';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('comments')
@Controller('posts/:postId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @Permissions(Permission.POSTS_READ)
  @ApiOperation({ summary: 'Discussion thread for a post' })
  list(@Param('postId', ParseIntPipe) postId: number) {
    return this.commentsService.list(postId);
  }

  @Post()
  @Permissions(Permission.COMMENTS_CREATE)
  @ApiOperation({ summary: 'Add a comment to a post' })
  create(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.commentsService.create(postId, dto, actor);
  }

  @Delete(':id')
  @Permissions(Permission.COMMENTS_MODERATE)
  @ApiOperation({ summary: 'Remove a comment' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.commentsService.remove(id, actor);
  }
}
