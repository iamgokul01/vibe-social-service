import { IsEnum } from 'class-validator';
import { Role } from '../../rbac/roles';

export class UpdateRoleDto {
  @IsEnum(Role)
  role: Role;
}
