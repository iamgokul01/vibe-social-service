export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  EDITOR = 'EDITOR',
  MEMBER = 'MEMBER',
}

export enum Permission {
  USERS_READ = 'users:read',
  USERS_CREATE = 'users:create',
  USERS_UPDATE = 'users:update',
  USERS_DELETE = 'users:delete',
  USERS_ACTIVATE = 'users:activate',
  USERS_ASSIGN_ROLE = 'users:assignRole',
  POSTS_READ = 'posts:read',
  POSTS_CREATE = 'posts:create',
  POSTS_UPDATE = 'posts:update',
  POSTS_DELETE = 'posts:delete',
  POSTS_PUBLISH = 'posts:publish',
  POSTS_MODERATE = 'posts:moderate',
  COMMENTS_CREATE = 'comments:create',
  COMMENTS_MODERATE = 'comments:moderate',
  LIKES_CREATE = 'likes:create',
  ANALYTICS_READ = 'analytics:read',
  ANALYTICS_EXPORT = 'analytics:export',
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  [Role.ADMIN]: [
    Permission.USERS_READ,
    Permission.USERS_CREATE,
    Permission.USERS_UPDATE,
    Permission.USERS_ACTIVATE,
    Permission.USERS_ASSIGN_ROLE,
    Permission.POSTS_READ,
    Permission.POSTS_CREATE,
    Permission.POSTS_UPDATE,
    Permission.POSTS_DELETE,
    Permission.POSTS_PUBLISH,
    Permission.POSTS_MODERATE,
    Permission.COMMENTS_CREATE,
    Permission.COMMENTS_MODERATE,
    Permission.LIKES_CREATE,
    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,
  ],
  [Role.MODERATOR]: [
    Permission.USERS_READ,
    Permission.POSTS_READ,
    Permission.POSTS_CREATE,
    Permission.POSTS_UPDATE,
    Permission.POSTS_DELETE,
    Permission.POSTS_PUBLISH,
    Permission.POSTS_MODERATE,
    Permission.COMMENTS_CREATE,
    Permission.COMMENTS_MODERATE,
    Permission.LIKES_CREATE,
    Permission.ANALYTICS_READ,
  ],
  [Role.EDITOR]: [
    Permission.POSTS_READ,
    Permission.POSTS_CREATE,
    Permission.POSTS_UPDATE,
    Permission.POSTS_DELETE,
    Permission.POSTS_PUBLISH,
    Permission.COMMENTS_CREATE,
    Permission.LIKES_CREATE,
    Permission.ANALYTICS_READ,
  ],
  [Role.MEMBER]: [
    Permission.POSTS_READ,
    Permission.COMMENTS_CREATE,
    Permission.LIKES_CREATE,
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'SuperAdmin',
  [Role.ADMIN]: 'Admin',
  [Role.MODERATOR]: 'Moderator',
  [Role.EDITOR]: 'Editor',
  [Role.MEMBER]: 'Member',
};

export const ROLE_TIERS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Full Privilege',
  [Role.ADMIN]: 'Full Privilege',
  [Role.MODERATOR]: 'Standard Publishing',
  [Role.EDITOR]: 'Standard Publishing',
  [Role.MEMBER]: 'Read Only',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.SUPER_ADMIN]:
    'Unrestricted control over platform settings, team billing, RBAC assignments, global content moderation, and audit security exports.',
  [Role.ADMIN]:
    'Unrestricted control over platform settings, team billing, RBAC assignments, global content moderation, and audit security exports.',
  [Role.MODERATOR]:
    'Review and moderate community submissions, resolve reported content, and keep member conversations constructive across the platform.',
  [Role.EDITOR]:
    'Create and publish official posts, manage editorial queue drafts, approve community stories, and inspect feed engagement analytics.',
  [Role.MEMBER]:
    'Browse internal feeds, participate in comments and discussions, like community entries, and view public member profiles.',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.USERS_READ]: 'View member directory',
  [Permission.USERS_CREATE]: 'Invite new members',
  [Permission.USERS_UPDATE]: 'Edit member profiles',
  [Permission.USERS_DELETE]: 'Delete member records',
  [Permission.USERS_ACTIVATE]: 'Activate or deactivate members',
  [Permission.USERS_ASSIGN_ROLE]: 'Modify user roles',
  [Permission.POSTS_READ]: 'Browse community feed',
  [Permission.POSTS_CREATE]: 'Draft new posts',
  [Permission.POSTS_UPDATE]: 'Edit community stories',
  [Permission.POSTS_DELETE]: 'Remove own posts',
  [Permission.POSTS_PUBLISH]: 'Publish public articles',
  [Permission.POSTS_MODERATE]: 'Moderate flagged content',
  [Permission.COMMENTS_CREATE]: 'Join discussions',
  [Permission.COMMENTS_MODERATE]: 'Moderate comments',
  [Permission.LIKES_CREATE]: 'Like community entries',
  [Permission.ANALYTICS_READ]: 'Access analytics dashboard',
  [Permission.ANALYTICS_EXPORT]: 'Export analytics reports',
};

export const ROLE_ORDER: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MODERATOR,
  Role.EDITOR,
  Role.MEMBER,
];

export const ALL_PERMISSIONS = Object.values(Permission);
