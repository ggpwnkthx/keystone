import { allowAll } from '@keystone-6/core/access'
import { BaseListTypeInfo, ListAccessControl } from "@keystone-6/core/types";
import merge from 'lodash.merge'
import { Context, Operations } from './types';

export const isLoggedIn = ({ session }: Context) => !!session;

export const allowLoggedIn = {
  operation: {
    query: isLoggedIn,
    create: isLoggedIn,
    update: isLoggedIn,
    delete: isLoggedIn,
  },
  filter: {
    query: (context) => (isLoggedIn(context) ? {} : false),
    update: (context) => (isLoggedIn(context) ? {} : false),
    delete: (context) => (isLoggedIn(context) ? {} : false),
  },
  item: {
    create: isLoggedIn,
    update: isLoggedIn,
    delete: isLoggedIn,
  },
} as ListAccessControl<BaseListTypeInfo>;

export const allowAllQuery = merge(allowLoggedIn, {
  operation: {
    query: allowAll,
  },
  filter: {
    query: allowAll,
  } as Partial<ListAccessControl<BaseListTypeInfo>>,
}) as ListAccessControl<BaseListTypeInfo>;

export const allowAllCreate: ListAccessControl<BaseListTypeInfo> = merge(
  allowLoggedIn,
  {
    operation: {
      create: allowAll,
    },
    item: {
      create: allowAll,
    } as Partial<ListAccessControl<BaseListTypeInfo>>,
  }
) as ListAccessControl<BaseListTypeInfo>;

export const allowAllQueryOrCreate = merge(
  allowAllQuery,
  allowAllCreate
) as ListAccessControl<BaseListTypeInfo>;

export async function isGlobalAdmin({ session, context }: Context) {
  if (!session) return false;
  return (
    (
      await context.sudo().query.Permission.findMany({
        where: {
          tenant: { title: { equals: (process.env?.TENANT_GLOBAL_TITLE ?? "Global") } },
          delegates: { some: { id: { equals: session.itemId } } },
        },
      })
    ).length === Operations.options.length
  );
}

export async function fetchTenantParents(
  { context }: Context,
  where: BaseListTypeInfo["inputs"]["where"],
  visited: Set<string> = new Set() // Keep track of visited tenant IDs to avoid infinite recursion
): Promise<string[]> {
  const tenants = await context.sudo().query.Tenant.findMany({
    where,
    query: "id parent { id }",
  });
  let allTenantIds: string[] = [];
  for (const tenant of tenants) {
    if (visited.has(tenant.id)) {
      // If we've already visited this tenant, skip to avoid infinite recursion
      continue;
    }
    visited.add(tenant.id); // Mark this tenant as visited
    allTenantIds.push(tenant.id); // Add the current tenant ID to the list
    // If there's a parent tenant, recursively find its ancestors
    if (tenant.parent) {
      const parentIds = await fetchTenantParents(
        { context },
        { id: { equals: tenant.parent.id } },
        visited // Pass the visited set forward to track all tenant IDs we've encountered
      );
      allTenantIds = allTenantIds.concat(parentIds); // Combine IDs from the parent
    }
  }
  return allTenantIds; // Return the flattened array of tenant IDs
}

export async function fetchTenantChildren(
  { context }: Context,
  where: BaseListTypeInfo["inputs"]["where"],
  visited: Set<string> = new Set() // Added to keep track of visited tenant IDs
): Promise<string[]> {
  const tenants = await context.sudo().query.Tenant.findMany({
    where,
    query: "id children { id }",
  });
  let allTenantIds: string[] = [];
  for (const tenant of tenants) {
    if (visited.has(tenant.id)) {
      // If we've already visited this tenant, skip to avoid infinite recursion
      continue;
    }
    visited.add(tenant.id); // Mark this tenant as visited
    allTenantIds.push(tenant.id); // Add the current tenant ID to the list
    if (tenant.children.length > 0) {
      const childIdsPromises = tenant.children.flatMap(
        (childTenant: Record<string, any>) => {
          if (!visited.has(childTenant.id)) {
            return fetchTenantChildren(
              { context },
              { id: { equals: childTenant.id } },
              visited // Pass the visited set forward to keep track of all tenant IDs we've encountered
            );
          } else {
            return [];
          }
        }
      );
      const childIds = await Promise.all(childIdsPromises);
      allTenantIds = allTenantIds.concat(childIds); // Combine IDs from children
    }
  }
  return allTenantIds; // Return the flattened array of tenant IDs
}

export async function fetchTenantGlobal({ context }: Context) {
  return await context.sudo().query.Tenant.findOne({
    where: { title: (process.env?.TENANT_GLOBAL_TITLE ?? "Global") },
  });
}

export async function can(
  { session, context }: Context,
  tenant: { id: string } | string,
  operation: "C" | "R" | "U" | "D",
): Promise<boolean> {
  if (await isGlobalAdmin({ session, context })) return true;
  const tenants = await fetchTenantParents(
    { context },
    { id: { equals: typeof tenant === "string" ? tenant : tenant.id } },
  );
  const permissions = await context.query.Permission.findMany({
    where: {
      operation: { equals: operation },
      tenant: { id: { in: tenants.flat(Infinity) } },
      delegates: { some: { id: { equals: session?.itemId } } },
    },
    query: "operation tenant { title }",
  });
  return permissions.length > 0;
}