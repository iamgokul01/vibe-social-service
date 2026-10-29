import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../rbac/roles';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsDto } from './dto/list-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get('trending-topics')
  @Permissions(Permission.POSTS_READ)
  @ApiOperation({ summary: 'Most active hashtags across the feed' })
  trendingTopics() {
    return this.postsService.trendingTopics();
  }

  @Get()
  @Permissions(Permission.POSTS_READ)
  @ApiOperation({ summary: 'Community feed with sorting and pagination' })
  list(@Query() query: ListPostsDto, @CurrentUser() viewer: AuthenticatedUser) {
    return this.postsService.list(query, viewer);
  }

  @Get(':id')
  @Permissions(Permission.POSTS_READ)
  @ApiOperation({ summary: 'Single post with viewer like state' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() viewer: AuthenticatedUser,
  ) {
    return this.postsService.findOne(id, viewer);
  }

  @Post()
  @Permissions(Permission.POSTS_CREATE)
  @ApiOperation({ summary: 'Publish a post to the community feed' })
  create(@Body() dto: CreatePostDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.postsService.create(dto, actor);
  }

  @Patch(':id')
  @Permissions(Permission.POSTS_UPDATE)
  @ApiOperation({ summary: 'Edit a post' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.postsService.update(id, dto, actor);
  }

  @Delete(':id')
  @Permissions(Permission.POSTS_DELETE)
  @ApiOperation({ summary: 'Remove a post' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.postsService.remove(id, actor);
  }

  @Post(':id/like')
  @Permissions(Permission.LIKES_CREATE)
  @ApiOperation({ summary: 'Toggle the like state for the current member' })
  toggleLike(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.postsService.toggleLike(id, actor);
  }

  @Post(':id/view')
  @Permissions(Permission.POSTS_READ)
  @ApiOperation({ summary: 'Record a view against a post' })
  recordView(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.postsService.recordView(id, actor);
  }
}
