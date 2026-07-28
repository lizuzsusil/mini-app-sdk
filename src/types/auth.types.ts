export interface PlatformUser {
  id: string;
  name: string;
  fullName?: string;
  email: string;
  nationalId?: string;
  roles: string[];
  permissions: string[];
  avatar?: string;
}

export interface AuthSdkModule {
  getUser(): Promise<PlatformUser | null>;
  isAuthenticated(): Promise<boolean>;
  logout(): Promise<void>;
}

export interface PermissionsSdkModule {
  has(permission: string): Promise<boolean>;
  list(): Promise<string[]>;
}
