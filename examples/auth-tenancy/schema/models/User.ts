import { list } from '@keystone-6/core'
import { allowLoggedIn, isGlobalAdmin } from '../utils';
import { Context } from '../types';
import { password, relationship, text } from '@keystone-6/core/fields';
import { BaseListTypeInfo, ListAccessControl } from "@keystone-6/core/types";
import merge from 'lodash.merge';

export const User = list({
  access: merge(allowLoggedIn, {
    filter: {
      query: async ({ session, context }: Context) => {
        if (!session) return false;
        if (await isGlobalAdmin({ session, context })) return {};
        // Filter for only relatives
        const permissions = {
          some: {
            id: {
              in: (await context.query.Permission.findMany()).map(
                (permission) => permission.id,
              ),
            },
          },
        };
        return { OR: [{ id: { equals: session.itemId } }, { permissions }] };
      },
    },
    item: {
      create: async (context) => {
        return !!(await context.context.query.Tenant.count({
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
      update: async (context) => {
        if (context.item.id === context.session.itemId) return true;
        return !(await context.context.query.Tenant.count({
          where: {
            permissions: {
              some: {
                operation: {
                  equals: "U",
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
      delete: async (context) => {
        if (context.item.id === context.session.itemId) return false;
        return !!(await context.context.query.Tenant.count({
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
    },
  } as Partial<ListAccessControl<BaseListTypeInfo>>),
  fields: {
    name: text({ validation: { isRequired: true } }),
    email: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    password: password(),
    permissions: relationship({
      ref: "Permission.delegates",
      many: true,
      ui: {
        displayMode: "select",
        itemView: { fieldMode: "hidden" },
      },
    }),
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
  },
})