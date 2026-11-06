/**
 * Project Orbit — Shared Interfaces, Types & Enums
 */

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

export enum OrgStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_DELETION = 'PENDING_DELETION',
  DELETED = 'DELETED',
}

export interface TenantContext {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  role: Role;
}

export interface AuthSessionPayload {
  sub: string; // userId
  email: string;
  name: string;
}

export interface AuthTokenResponse {
  user: AuthenticatedUser;
  organizations: OrganizationSummary[];
  activeOrgId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class OrbitError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'OrbitError';
  }
}
