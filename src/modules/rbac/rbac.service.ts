import { Injectable } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  Permission,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  ROLE_PERMISSIONS,
  ROLE_TIERS,
  Role,
} from './roles';

@Injectable()
export class RbacService {
  getPermissionsForRole(role: Role): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  hasPermission(role: Role, permission: Permission): boolean {
    return this.getPermissionsForRole(role).includes(permission);
  }

  hasAnyPermission(role: Role, permissions: Permission[]): boolean {
    return permissions.some((permission) => this.hasPermission(role, permission));
  }

  getMatrix() {
    return ROLE_ORDER.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      tier: ROLE_TIERS[role],
      description: ROLE_DESCRIPTIONS[role],
      permissions: this.getPermissionsForRole(role),
    }));
  }

  getAllPermissions() {
    return ALL_PERMISSIONS;
  }
}
