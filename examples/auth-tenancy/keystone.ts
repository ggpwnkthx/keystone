import { config } from '@keystone-6/core'
import { statelessSessions } from '@keystone-6/core/session'
import { createAuth } from '@keystone-6/auth'
import { fixPrismaPath } from '../example-utils'
import lists from './schema'
import { type TypeInfo } from '.keystone/types'
import * as dotenv from "dotenv";
import seedData from './seed-data'
import { Session } from './schema/types'

dotenv.config()

// WARNING: this example is for demonstration purposes only
//   as with each of our examples, it has not been vetted
//   or tested for any particular usage

// WARNING: you need to change this
const sessionSecret = process.env.SESSION_SECRET ?? '-- DEV COOKIE SECRET; CHANGE ME --'

// statelessSessions uses cookies for session tracking
//   these cookies have an expiry, in seconds
//   we use an expiry of one hour for this example
const sessionMaxAge = 60 * 60

// withAuth is a function we can use to wrap our base configuration
const { withAuth } = createAuth({
  // this is the list that contains our users
  listKey: 'User',

  // an identity field, typically a username or an email address
  identityField: 'email',

  // a secret field must be a password field type
  secretField: 'password',

  // initFirstItem enables the "First User" experience, this will add an interface form
  //   adding a new User item if the database is empty
  //
  // WARNING: do not use initFirstItem in production
  //   see https://keystonejs.com/docs/config/auth#init-first-item for more
  initFirstItem: {
    // the following fields are used by the "Create First User" form
    fields: ['name', 'email', 'password'],
  },

  // add email and name to the session data
  sessionData: 'email name',
})

export default withAuth<TypeInfo<Session>>(
  config<TypeInfo>({
    db: {
      provider: 'sqlite',
      url: process.env.DATABASE_URL || 'file:./keystone-example.db',
      onConnect: seedData,

      // WARNING: this is only needed for our monorepo examples, dont do this
      ...fixPrismaPath,
    },
    lists,
    // you can find out more at https://keystonejs.com/docs/apis/session#session-api
    session: statelessSessions({
      // the maxAge option controls how long session cookies are valid for before they expire
      maxAge: sessionMaxAge,
      // the session secret is used to encrypt cookie data
      secret: sessionSecret,
    }),
  })
)
