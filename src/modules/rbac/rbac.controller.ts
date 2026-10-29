import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from './roles';
import { RbacService } from './rbac.service';

@ApiTags('rbac')
@Controller('roles')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('matrix')
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Role to permission matrix' })
  matrix() {
    return {
      roles: this.rbacService.getMatrix(),
      permissions: this.rbacService.getAllPermissions(),
    };
  }
}
