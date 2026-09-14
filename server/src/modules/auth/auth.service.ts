import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { hashPassword, verifyPassword } from "./auth.password.js";
import type { LoginInput, RegisterInput } from "./auth.validation.js";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
};

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  roleAssignments: {
    select: {
      role: {
        select: {
          code: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  roleAssignments: Array<{ role: { code: string } }>;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roleAssignments.map(({ role }) => role.code).sort(),
  };
}

export async function registerCustomer(input: RegisterInput): Promise<PublicUser> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    },
    select: publicUserSelect,
  });

  return toPublicUser(user);
}

export async function loginUser(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      name: true,
      roleAssignments: publicUserSelect.roleAssignments,
      passwordHash: true,
    },
  });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password.");
  }

  return toPublicUser(user);
}

export async function getCurrentUser(userId: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  return user ? toPublicUser(user) : null;
}
