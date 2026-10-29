import { RbacService } from './rbac.service';
import { Permission, Role } from './roles';

describe('RbacService', () => {
  const service = new RbacService();

  it('grants every permission to a super admin', () => {
    const granted = service.getPermissionsForRole(Role.SUPER_ADMIN);

    expect(granted).toHaveLength(Object.values(Permission).length);
  });

  it('does not let an admin grant the super admin role', () => {
    expect(service.hasPermission(Role.ADMIN, Permission.USERS_ASSIGN_ROLE)).toBe(true);
    expect(service.getPermissionsForRole(Role.ADMIN)).not.toContain(Permission.USERS_DELETE);
  });

  it('keeps analytics read only for moderators without export', () => {
    expect(service.hasPermission(Role.MODERATOR, Permission.ANALYTICS_READ)).toBe(true);
    expect(service.hasPermission(Role.MODERATOR, Permission.ANALYTICS_EXPORT)).toBe(false);
  });

  it('gives members only read, comment and like capabilities', () => {
    expect(service.getPermissionsForRole(Role.MEMBER).sort()).toEqual(
      [
        Permission.POSTS_READ,
        Permission.COMMENTS_CREATE,
        Permission.LIKES_CREATE,
      ].sort(),
    );
  });

  it('never lets a member manage users', () => {
    expect(service.hasPermission(Role.MEMBER, Permission.USERS_READ)).toBe(false);
    expect(service.hasPermission(Role.MEMBER, Permission.USERS_CREATE)).toBe(false);
    expect(service.hasPermission(Role.MEMBER, Permission.USERS_ASSIGN_ROLE)).toBe(false);
  });

  it('reports any-of permissions correctly', () => {
    expect(
      service.hasAnyPermission(Role.EDITOR, [Permission.ANALYTICS_EXPORT, Permission.ANALYTICS_READ]),
    ).toBe(true);
    expect(
      service.hasAnyPermission(Role.EDITOR, [Permission.ANALYTICS_EXPORT, Permission.USERS_READ]),
    ).toBe(false);
  });

  it('exposes a matrix entry for every role', () => {
    const matrix = service.getMatrix();

    expect(matrix).toHaveLength(5);
    matrix.forEach((entry) => {
      expect(entry.permissions.length).toBeGreaterThan(0);
      expect(entry.label).toBeTruthy();
      expect(entry.tier).toBeTruthy();
    });
  });
});
