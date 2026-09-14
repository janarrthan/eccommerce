import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { PermissionCode } from "./authorization.constants.js";

export type AuthorizationContext = {
  userId: string;
  roleCodes: string[];
  permissionCodes: string[];
};

export async function getAuthorizationContext(userId: string): Promise<AuthorizationContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      roleAssignments: {
        select: {
          role: {
            select: {
              code: true,
              rolePermissions: {
                select: {
                  permission: {
                    select: {
                      code: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new HttpError(401, "Authentication required.");
  }

  const roleCodes = user.roleAssignments.map(({ role }) => role.code).sort();
  const permissionCodes = [
    ...new Set(
      user.roleAssignments.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => permission.code)),
    ),
  ].sort();

  return {
    userId: user.id,
    roleCodes,
    permissionCodes,
  };
}

export function assertAdminAccess(context: AuthorizationContext) {
  if (context.roleCodes.length === 0) {
    throw new HttpError(403, "Admin access required.");
  }
}

export function assertPermission(context: AuthorizationContext, requiredPermission: PermissionCode) {
  if (!context.permissionCodes.includes(requiredPermission)) {
    throw new HttpError(403, "Permission denied.");
  }
}
