import { list } from '@keystone-6/core'
import { allowLoggedIn, can, fetchTenantChildren, fetchTenantGlobal, isGlobalAdmin } from '../utils';
import { Context, Operations } from '../types';
import { relationship, text } from '@keystone-6/core/fields';
import { BaseListTypeInfo, ListAccessControl } from "@keystone-6/core/types";
import merge from 'lodash.merge';

export const Tenant = list({
    access: merge(allowLoggedIn, {
      filter: {
        query: async ({ session, context }: Context) => {
          if (!session) return false;
          if (await isGlobalAdmin({ session, context })) return {};
          const hierarchy = await fetchTenantChildren(
            { context },
            {
              permissions: {
                some: { delegates: { some: { id: { equals: session.itemId } } } },
              },
            },
          );
          return { id: { in: hierarchy.flat(Infinity) } };
        },
      },
      item: {
        create: async ({ session, context, inputData }) => {
          // If attempting to create the global tenant
          if (inputData.title === (process.env?.TENANT_GLOBAL_TITLE ?? "Global")) {
            // check if it exists
            if (
              await context.sudo().query.Tenant.findOne({
                where: { title: (process.env?.TENANT_GLOBAL_TITLE ?? "Global") },
              })
            ) {
              return false;
            } else {
              return true;
            }
          }
          // Check if allowed to create on parent
          return await can(
            { session, context },
            inputData.parent?.connect?.id ??
            (await fetchTenantGlobal({ context })).id,
            "C",
          );
        },
        update: async ({ session, context, item, inputData }) => {
          // If changing parent
          if (inputData.parent?.connect?.id && item.parentId)
            return (
              // Check if adding to the new parent is allowed
              (await can(
                { session, context },
                inputData.parent.connect.id,
                "C",
              )) &&
              // Check if removing from the current parent is allowed
              (await can({ session, context }, item.parentId.toString(), "D"))
            );
          // Otherwise
          return await can({ session, context }, item.id.toString(), "U");
        },
        delete: ({ session, context, item }) =>
          can({ session, context }, item.id.toString(), "D"),
      },
    } as Partial<ListAccessControl<BaseListTypeInfo>>),
    fields: {
      title: text({ validation: { isRequired: true }, isIndexed: "unique" }),
      parent: relationship({
        ref: "Tenant.children",
        many: false,
        ui: {
          hideCreate: true,
          itemView: { fieldMode: "hidden" },
        },
      }),
      children: relationship({
        ref: "Tenant.parent",
        many: true,
        ui: {
          hideCreate: true,
          createView: { fieldMode: "hidden" },
        },
      }),
      permissions: relationship({
        ref: "Permission.tenant",
        many: true,
        ui: {
          displayMode: "cards",
          cardFields: ["operation", "delegates"],
          createView: { fieldMode: "hidden" },
          listView: { fieldMode: "hidden" },
          itemView: {
            fieldMode: async ({ session, context, item }) =>
              (await can({ session, context }, item.id.toString(), "U"))
                ? "edit"
                : "read",
          },
          inlineConnect: false,
          hideCreate: true,
          inlineEdit: { fields: ["delegates"] },
          removeMode: "none",
        },
      }),
    },
    hooks: {
      resolveInput: async ({ inputData, resolvedData, item, context }) => {
        if (
          !(
            item?.title === (process.env?.TENANT_GLOBAL_TITLE ?? "Global") ||
            inputData.title === (process.env?.TENANT_GLOBAL_TITLE ?? "Global") ||
            resolvedData.title === (process.env?.TENANT_GLOBAL_TITLE ?? "Global")
          ) &&
          !item?.parentId &&
          !inputData.parentId &&
          !resolvedData.parent
        )
          resolvedData.parent = {
            connect: await context.sudo().query.Tenant.findOne({
              where: { title: (process.env?.TENANT_GLOBAL_TITLE ?? "Global") },
            }),
          };
        return resolvedData;
      },
      afterOperation: async ({ operation, item, context }) => {
        if (operation === "create") {
          await context.sudo().db.Permission.createMany({
            data: Operations.options.map((op) => ({
              operation: typeof op === "string" ? op : op.value,
              tenant: { connect: { id: item.id } },
            })),
          });
        }
      },
    },
    ui: {
      isHidden: async (context) => {
        const tenants_total = await context.context.query.Tenant.count();
        const tenants_editable = await context.context.query.Tenant.count({
          where: {
            permissions: {
              some: {
                operation: {
                  in: ["C", "U", "D"],
                },
                delegates: {
                  some: {
                    id: {
                      equals: context.session.itemId,
                    },
                  },
                },
              },
            },
          },
        });
        if (tenants_total === 1 && !tenants_editable) return true;
        return false;
      },
      hideCreate: async (context) => {
        return !(await context.context.query.Tenant.count({
          where: {
            permissions: {
              some: {
                operation: {
                  equals: "C",
                },
                delegates: {
                  some: {
                    id: {
                      equals: context.session.itemId,
                    },
                  },
                },
              },
            },
          },
        }));
      },
      hideDelete: async (context) => {
        return !(await context.context.query.Tenant.count({
          where: {
            permissions: {
              some: {
                operation: {
                  equals: "D",
                },
                delegates: {
                  some: {
                    id: {
                      equals: context.session.itemId,
                    },
                  },
                },
              },
            },
          },
        }));
      },
      listView: {
        initialColumns: ["title", "parent", "children"],
      },
    },
  });