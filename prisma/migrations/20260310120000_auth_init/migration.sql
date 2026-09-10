-- Auth identity + program tenancy

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "OrganizationType" AS ENUM ('silva', 'spx', 'vendor');
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE "ProgramStatus" AS ENUM ('active', 'archived');
CREATE TYPE "ProgramMemberRole" AS ENUM ('owner', 'manager', 'executor', 'viewer');
CREATE TYPE "UserAccountStatus" AS ENUM ('invited', 'active', 'suspended');

CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "brandingJson" JSONB,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ProgramStatus" NOT NULL DEFAULT 'active',
    "brandingJson" JSONB,
    "createdByOrgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "programs_slug_key" ON "programs"("slug");

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "activeProgramId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'active',
    "totpSecret" TEXT,
    "totpEnrolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_activeProgramId_idx" ON "users"("activeProgramId");

CREATE TABLE "program_memberships" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleInProgram" "ProgramMemberRole" NOT NULL DEFAULT 'manager',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_memberships_programId_organizationId_key" ON "program_memberships"("programId", "organizationId");
CREATE INDEX "program_memberships_organizationId_idx" ON "program_memberships"("organizationId");

CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "otpVerifiedAt" TIMESTAMP(3),
    "deviceLabel" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key" ON "refresh_sessions"("tokenHash");
CREATE INDEX "refresh_sessions_userId_revoked_idx" ON "refresh_sessions"("userId", "revoked");

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");

ALTER TABLE "programs" ADD CONSTRAINT "programs_createdByOrgId_fkey" FOREIGN KEY ("createdByOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_activeProgramId_fkey" FOREIGN KEY ("activeProgramId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "program_memberships" ADD CONSTRAINT "program_memberships_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_memberships" ADD CONSTRAINT "program_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
