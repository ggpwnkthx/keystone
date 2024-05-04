import { type Context } from '.keystone/types'
import * as dotenv from "dotenv";

dotenv.config()

export default async function seedData(context: Context) {
    let new_global = false
    const TENANT_GLOBAL_TITLE = process.env.TENANT_GLOBAL_TITLE ?? "Global"
    if (!(await context.sudo().query.Tenant.findOne({
      where: { title: process.env.TENANT_GLOBAL_TITLE }
    }))) {
      await context.sudo().query.Tenant.createOne({
        data: {
          title: TENANT_GLOBAL_TITLE,
        }
      })
      new_global = true
    }

    const global = await context.sudo().query.Tenant.findOne({
      where: { title: process.env.TENANT_GLOBAL_TITLE },
      query: "id, permissions { id }"
    })

    if (process.env.ADMIN_EMAIL) {
      const admin = await context.sudo().query.User.findOne({
        where: { email: process.env.ADMIN_EMAIL },
        query: "id, name"
      })
      if (!admin) {
        await context.sudo().query.User.createOne({
          data: {
            name: process.env.ADMIN_NAME ?? "Admin",
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_PASSWORD ?? "password",
            permissions: {
              connect: global.permissions
            }
          }
        })
      } else {
        if (process.env.ADMIN_NAME && (process.env.ADMIN_NAME !== admin.name)) {
          await context.sudo().query.User.updateOne({
            where: { id: admin.id },
            data: { name: process.env.ADMIN_NAME }
          })
        }
        if (process.env.ADMIN_PASSWORD) {
          await context.sudo().query.User.updateOne({
            where: { id: admin.id },
            data: { password: process.env.ADMIN_PASSWORD }
          })
        }
        if (new_global) {
          await context.sudo().query.User.updateOne({
            where: { id: admin.id },
            data: {
              permissions: {
                connect: global.permissions
              }
            }
          })
        }
      }
    }
  }