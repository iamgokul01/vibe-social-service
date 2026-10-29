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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('stats')
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Member directory headline statistics' })
  stats() {
    return this.usersService.stats();
  }

  @Get('roles')
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Roles with member counts and granted permissions' })
  roles() {
    return this.usersService.roles();
  }

  @Get()
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Search and filter the member directory' })
  list(@Query() query: ListUsersDto) {
    return this.usersService.list(query);
  }

  @Get(':id')
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Single member record' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Permissions(Permission.USERS_CREATE)
  @ApiOperation({ summary: 'Invite a member and assign their initial role' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.create(dto, actor);
  }

  @Patch(':id')
  @Permissions(Permission.USERS_UPDATE)
  @ApiOperation({ summary: 'Edit member profile fields' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, actor);
  }

  @Patch(':id/role')
  @Permissions(Permission.USERS_ASSIGN_ROLE)
  @ApiOperation({ summary: 'Change the access level assigned to a member' })
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updateRole(id, dto, actor);
  }

  @Patch(':id/status')
  @Permissions(Permission.USERS_ACTIVATE)
  @ApiOperation({ summary: 'Activate or deactivate a member' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updateStatus(id, dto, actor);
  }

  @Delete(':id/access')
  @Permissions(Permission.USERS_ASSIGN_ROLE)
  @ApiOperation({ summary: 'Revoke all access for a member' })
  revokeAccess(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.revokeAccess(id, actor);
  }

  @Delete(':id')
  @Permissions(Permission.USERS_DELETE)
  @ApiOperation({ summary: 'Delete a member record' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.remove(id, actor);
  }
}
