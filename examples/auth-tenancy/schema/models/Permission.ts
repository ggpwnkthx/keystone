import { graphql, list } from '@keystone-6/core'
import { allowLoggedIn, can, fetchTenantChildren, isGlobalAdmin } from '../utils';
import { Context, Operations } from '../types';
import { relationship, select, virtual } from '@keystone-6/core/fields';
import { BaseListTypeInfo, ListAccessControl } from "@keystone-6/core/types";
import merge from 'lodash.merge';

export const Permission = list({
  access: merge(allowLoggedIn, {
    operation: {
      create: () => false,
      // update: () => false,
      delete: () => false,
    },
    filter: {
      query: async ({ session, context }: Context) => {
        if (!session) return false;
        if (await isGlobalAdmin({ session, context })) return {};
        // Filter for only relatives
        const permissions_direct: {
          tenant: { id: string };
          operation: string;
        }[] = (
          await context.sudo().query.User.findOne({
            where: { id: session.itemId },
            query: "permissions { tenant { id }, operation }",
          })
        ).permissions;
        const tenants = (
          await fetchTenantChildren(
            { context },
            {
              id: {
                in: permissions_direct
                  .filter((item) => item.operation === "R")
                  .map((item) => item.tenant.id)
                  .reduce((uniqueIds, id) => {
                    if (!uniqueIds.includes(id)) {
                      uniqueIds.push(id);
                    }
                    return uniqueIds;
                  }, [] as string[]),
              },
            },
          )
        )
          .flat(Infinity)
          .reduce((uniqueIds, id) => {
            if (!uniqueIds.includes(id)) {
              uniqueIds.push(id);
            }
            return uniqueIds;
          }, [] as string[]);
        return { tenant: { id: { in: tenants } } };
      },
    },
    item: {
      update: async ({ session, context, item }) => {
        return await can({ session, context }, item.tenantId.toString(), "U");
      },
    },
  } as Partial<
    ListAccessControl<BaseListTypeInfo>
  >) as ListAccessControl<BaseListTypeInfo>,
  fields: {
    title: virtual({
      field: graphql.field({
        type: graphql.String,
        async resolve(item, _, context) {
          const tenant = await context.query.Tenant.findOne({
            where: { id: item.tenantId.toString() },
            query: "title",
          });
          const op = Operations.options.find(
            (x) => x["value"] === item.operation.toString(),
          )["label"];
          return `${tenant.title} - ${op}`;
        },
      }),
    }),
    tenant: relationship({ ref: "Tenant.permissions", many: false }),
    operation: select(Operations),
    delegates: relationship({ ref: "User.permissions", many: true }),
  },
  hooks: {
    validateInput: async ({
      operation,
      resolvedData,
      addValidationError,
      context,
      item,
    }) => {
      if (resolvedData.operation && resolvedData.tenant) {
        if (
          operation === "create" &&
          (
            await context.sudo().query.Permission.findMany({
              where: {
                operation: { equals: resolvedData.operation },
                tenant: {
                  id: {
                    equals:
                      resolvedData.tenant.connect?.id ??
                      resolvedData.tenant.create?.id,
                  },
                },
              },
            })
          ).length > 0
        )
          addValidationError("This record already exists.");
      } else {
        if (!resolvedData.operation && !item?.operation)
          addValidationError("An Operation must be set.");
        if (!resolvedData.tenant && !item?.tenantId)
          addValidationError("A Tenant must be set.");
      }
    },
    validateDelete: async ({ item, context, addValidationError }) => {
      if (
        item.tenantId &&
        (
          await context
            .sudo()
            .query.Tenant.findOne({ where: { id: item.tenantId.toString() } })
        ).length > 0
      )
        addValidationError("The Tenant still exists.");
    },
  },
  ui: {
    isHidden: async (context) => !(await isGlobalAdmin(context)),
    hideCreate: true,
    hideDelete: true,
  },
})