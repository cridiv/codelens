import { Graph } from './types/graph';

export const mockCodebaseGraph: Graph = {
  nodes: [
    // --- internal/auth/service.go ---
    {
      id: 'pkg:auth',
      kind: 'type',
      name: 'AuthService',
      path: 'internal/auth/service.go',
      metadata: {
        package: 'auth',
        file: 'service.go',
        doc: 'Core authentication service managing JWT lifecycle, OAuth sessions, and password verification.',
        loc: '184',
        signature: 'type AuthService struct',
      },
      members: [
        { name: 'db', type: '*sql.DB', kind: 'field' },
        { name: 'jwtSecret', type: '[]byte', kind: 'field' },
        { name: 'tokenDuration', type: 'time.Duration', kind: 'field' },
        { name: 'sessionCache', type: 'TokenStore', kind: 'field' },
        { name: 'Authenticate(ctx, email, pass)', type: '(*Session, error)', kind: 'method', isExported: true },
        { name: 'ValidateToken(tokenStr)', type: '(*TokenClaims, error)', kind: 'method', isExported: true },
        { name: 'RevokeSession(ctx, sessionID)', type: 'error', kind: 'method', isExported: true },
        { name: 'Refresh(ctx, refreshToken)', type: '(*TokenPair, error)', kind: 'method', isExported: true },
      ],
    },
    {
      id: 'type:token_claims',
      kind: 'type',
      name: 'TokenClaims',
      path: 'internal/auth/service.go',
      metadata: {
        package: 'auth',
        file: 'service.go',
        doc: 'JWT payload claims containing subject user ID, organization ID, and role permissions.',
        loc: '28',
        signature: 'type TokenClaims struct',
      },
      members: [
        { name: 'UserID', type: 'uuid.UUID', kind: 'field', isExported: true },
        { name: 'OrgID', type: 'uuid.UUID', kind: 'field', isExported: true },
        { name: 'Role', type: 'string', kind: 'field', isExported: true },
        { name: 'ExpiresAt', type: 'int64', kind: 'field', isExported: true },
        { name: 'Valid()', type: 'error', kind: 'method', isExported: true },
      ],
    },

    // --- internal/auth/token_store.go ---
    {
      id: 'pkg:token_store',
      kind: 'interface',
      name: 'TokenStore',
      path: 'internal/auth/token_store.go',
      metadata: {
        package: 'auth',
        file: 'token_store.go',
        doc: 'Interface for persistence of token blacklist and active refresh tokens.',
        loc: '35',
        signature: 'type TokenStore interface',
      },
      members: [
        { name: 'Store(ctx, token, ttl)', type: 'error', kind: 'method', isExported: true },
        { name: 'Get(ctx, key)', type: '(*TokenData, error)', kind: 'method', isExported: true },
        { name: 'Delete(ctx, token)', type: 'error', kind: 'method', isExported: true },
        { name: 'IsBlacklisted(token)', type: 'bool', kind: 'method', isExported: true },
      ],
    },
    {
      id: 'type:token_data',
      kind: 'type',
      name: 'TokenData',
      path: 'internal/auth/token_store.go',
      metadata: {
        package: 'auth',
        file: 'token_store.go',
        doc: 'Cached token metadata including device fingerprint and issuance timestamp.',
        loc: '24',
        signature: 'type TokenData struct',
      },
      members: [
        { name: 'TokenID', type: 'string', kind: 'field', isExported: true },
        { name: 'IssuedAt', type: 'time.Time', kind: 'field', isExported: true },
        { name: 'Revoked', type: 'bool', kind: 'field', isExported: true },
      ],
    },

    // --- internal/models/user.go ---
    {
      id: 'pkg:user',
      kind: 'type',
      name: 'User',
      path: 'internal/models/user.go',
      metadata: {
        package: 'models',
        file: 'user.go',
        doc: 'Database entity representing an active user profile and organization membership.',
        loc: '65',
        signature: 'type User struct',
      },
      members: [
        { name: 'id', type: 'uuid.UUID [PK]', kind: 'field' },
        { name: 'email', type: 'string [UNIQUE]', kind: 'field' },
        { name: 'password_hash', type: 'string', kind: 'field' },
        { name: 'role', type: 'UserRole', kind: 'field' },
        { name: 'org_id', type: 'uuid.UUID [FK -> Org.id]', kind: 'field' },
        { name: 'created_at', type: 'time.Time', kind: 'field' },
        { name: 'updated_at', type: 'time.Time', kind: 'field' },
        { name: 'FullName()', type: 'string', kind: 'method', isExported: true },
        { name: 'HasPermission(perm)', type: 'bool', kind: 'method', isExported: true },
      ],
    },
    {
      id: 'type:user_role',
      kind: 'type',
      name: 'UserRole',
      path: 'internal/models/user.go',
      metadata: {
        package: 'models',
        file: 'user.go',
        doc: 'Enumeration of role permissions for RBAC enforcement.',
        loc: '18',
        signature: 'type UserRole string',
      },
      members: [
        { name: 'RoleAdmin', type: '"ADMIN"', kind: 'field', isExported: true },
        { name: 'RoleMember', type: '"MEMBER"', kind: 'field', isExported: true },
        { name: 'RoleViewer', type: '"VIEWER"', kind: 'field', isExported: true },
        { name: 'CanWrite()', type: 'bool', kind: 'method', isExported: true },
      ],
    },

    // --- internal/models/session.go ---
    {
      id: 'pkg:session',
      kind: 'type',
      name: 'Session',
      path: 'internal/models/session.go',
      metadata: {
        package: 'models',
        file: 'session.go',
        doc: 'Active token session holding client device fingerprint and expiration.',
        loc: '42',
        signature: 'type Session struct',
      },
      members: [
        { name: 'id', type: 'uuid.UUID [PK]', kind: 'field' },
        { name: 'user_id', type: 'uuid.UUID [FK -> User.id]', kind: 'field' },
        { name: 'access_token', type: 'string', kind: 'field' },
        { name: 'refresh_token', type: 'string [UNIQUE]', kind: 'field' },
        { name: 'expires_at', type: 'time.Time', kind: 'field' },
        { name: 'ip_address', type: 'net.IP', kind: 'field' },
        { name: 'IsExpired()', type: 'bool', kind: 'method', isExported: true },
      ],
    },

    // --- internal/models/org.go ---
    {
      id: 'pkg:org',
      kind: 'type',
      name: 'Organization',
      path: 'internal/models/org.go',
      metadata: {
        package: 'models',
        file: 'org.go',
        doc: 'Multi-tenant workspace organization containing members and billing subscriptions.',
        loc: '55',
        signature: 'type Organization struct',
      },
      members: [
        { name: 'id', type: 'uuid.UUID [PK]', kind: 'field' },
        { name: 'name', type: 'string', kind: 'field' },
        { name: 'slug', type: 'string [UNIQUE]', kind: 'field' },
        { name: 'tier', type: 'string (FREE|PRO|ENTERPRISE)', kind: 'field' },
        { name: 'created_at', type: 'time.Time', kind: 'field' },
        { name: 'GetSeatCount()', type: 'int', kind: 'method', isExported: true },
      ],
    },

    // --- internal/server/router.go ---
    {
      id: 'pkg:router',
      kind: 'type',
      name: 'HttpRouter',
      path: 'internal/server/router.go',
      metadata: {
        package: 'server',
        file: 'router.go',
        doc: 'HTTP multiplexer registering API v1 routes, auth middleware, and error handlers.',
        loc: '120',
        signature: 'type HttpRouter struct',
      },
      members: [
        { name: 'mux', type: '*chi.Mux', kind: 'field' },
        { name: 'authService', type: '*auth.AuthService', kind: 'field' },
        { name: 'RegisterRoutes()', type: 'void', kind: 'method', isExported: true },
        { name: 'AuthMiddleware(next)', type: 'http.Handler', kind: 'method', isExported: true },
        { name: 'HandleLogin(w, r)', type: 'void', kind: 'method', isExported: true },
        { name: 'HandleMe(w, r)', type: 'void', kind: 'method', isExported: true },
      ],
    },

    // --- internal/db/postgres.go ---
    {
      id: 'pkg:database',
      kind: 'type',
      name: 'DatabaseEngine',
      path: 'internal/db/postgres.go',
      metadata: {
        package: 'db',
        file: 'postgres.go',
        doc: 'PostgreSQL connection pool manager with auto-migration and connection health probes.',
        loc: '95',
        signature: 'type DatabaseEngine struct',
      },
      members: [
        { name: 'pool', type: '*pgxpool.Pool', kind: 'field' },
        { name: 'config', type: 'DBConfig', kind: 'field' },
        { name: 'Connect(ctx, dsn)', type: '(*pgxpool.Pool, error)', kind: 'method', isExported: true },
        { name: 'RunMigrations(ctx)', type: 'error', kind: 'method', isExported: true },
        { name: 'Ping(ctx)', type: 'error', kind: 'method', isExported: true },
        { name: 'Close()', type: 'error', kind: 'method', isExported: true },
      ],
    },
  ],
  edges: [
    // Intra-file relations
    {
      id: 'e-auth-claims',
      from: 'pkg:auth',
      to: 'type:token_claims',
      kind: 'references',
      metadata: { label: 'produces & verifies' },
    },
    {
      id: 'e-tokenstore-tokendata',
      from: 'pkg:token_store',
      to: 'type:token_data',
      kind: 'references',
      metadata: { label: 'stores data' },
    },
    {
      id: 'e-user-userrole',
      from: 'pkg:user',
      to: 'type:user_role',
      kind: 'references',
      metadata: { label: 'has role' },
    },

    // Cross-file relations
    {
      id: 'e-router-auth',
      from: 'pkg:router',
      to: 'pkg:auth',
      kind: 'calls',
      metadata: { label: 'authenticates via' },
    },
    {
      id: 'e-auth-user',
      from: 'pkg:auth',
      to: 'pkg:user',
      kind: 'references',
      metadata: { label: 'loads & verifies' },
    },
    {
      id: 'e-auth-session',
      from: 'pkg:auth',
      to: 'pkg:session',
      kind: 'calls',
      metadata: { label: 'issues & validates' },
    },
    {
      id: 'e-auth-tokenstore',
      from: 'pkg:auth',
      to: 'pkg:token_store',
      kind: 'implements',
      metadata: { label: 'delegates cache' },
    },
    {
      id: 'e-session-user',
      from: 'pkg:session',
      to: 'pkg:user',
      kind: 'foreign_key',
      metadata: { label: 'user_id -> User.id' },
    },
    {
      id: 'e-user-org',
      from: 'pkg:user',
      to: 'pkg:org',
      kind: 'foreign_key',
      metadata: { label: 'org_id -> Org.id' },
    },
    {
      id: 'e-auth-db',
      from: 'pkg:auth',
      to: 'pkg:database',
      kind: 'depends_on',
      metadata: { label: 'queries DB' },
    },
  ],
};
