'use strict'

const Hapi = require('hapi')
const Boom = require('boom')
const qs = require('qs')
const fetch = require('node-fetch')
const jsonwebtoken = require('jsonwebtoken')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

/**
 * Environment Variables:
 * In a real scenario get them using process.env
 */

const FACEBOOK_APP_ID = '2118871078377333'
const FACEBOOK_APP_SECRET = 'f86762424324c3b50d4df9c61b2f2f98'
const JWT_SECRET = 'ABRACADABRA'

/**
 * Constants
 */

const FACEBOOK_ACCESS_TOKEN_URL = 'https://graph.accountkit.com/v1.0/access_token'
const FACEBOOK_ME_URL = 'https://graph.accountkit.com/v1.0/me'

/**
 * Server Initialization
 */

const init = async () => {
  const server = Hapi.server({ port: 3000 })
  const db = getDatabase()

  await server.register(require('hapi-auth-jwt2'))

  server.auth.strategy('jwt', 'jwt', {
    key: JWT_SECRET,
    validate: validateJWT,
    verifyOptions: { algorithms: ['HS256'] },
  })

  /**
   * Routes
   */

  server.route({ method: 'POST', path: '/auth', config: { auth: false }, handler: handleAuth })
  server.route({ method: 'GET', path: '/me', config: { auth: 'jwt' }, handler: handleMe })

  /**
   * Route Handlers
   */

  async function handleAuth(request) {
    const users = db.get('users')

    try {
      const authInfo = await getFacebookToken(request.query.code)

      let user = users.find({ id: authInfo.id }).value()

      if (!user) {
        const { phone } = await getFacebookMe(authInfo['access_token'])
        user = { id: authInfo.id, phone }
        users.push(user).write()
      }

      const jwt = jsonwebtoken.sign({ sub: user.id }, JWT_SECRET)
      return { jwt }
    } catch (err) {
      return Boom.unauthorized()
    }
  }

  function handleMe(request) {
    const users = db.get('users')

    const { credentials } = request.auth
    const user = users.find({ id: credentials.sub }).value()

    if (!user) {
      return Boom.forbidden()
    }

    return user
  }

  await server.start()

  console.log(`Server running at: ${server.info.uri}`)
}

process.on('unhandledRejection', err => {
  console.log(err)
  process.exit(1)
})

init()

/**
 * Helpers
 */

function getDatabase() {
  const adapter = new FileSync('db.json')
  const db = low(adapter)
  db.defaults({ users: [] }).write()
  return db
}

function validateJWT(decodedToken) {
  if (!decodedToken) {
    return { isValid: false }
  }

  return { isValid: true, credentials: decodedToken }
}

async function getFacebookToken(code) {
  var accessToken = ['AA', FACEBOOK_APP_ID, FACEBOOK_APP_SECRET].join('|')
  var params = { grant_type: 'authorization_code', code, access_token: accessToken }

  const url = `${FACEBOOK_ACCESS_TOKEN_URL}?${qs.stringify(params)}`
  const headers = { 'Content-Type': 'application/json' }

  const res = await fetch(url, { headers })

  if (!res.ok) {
    throw Error(res.statusText)
  }

  return res.json()
}

async function getFacebookMe(token) {
  var params = { access_token: token }

  const url = `${FACEBOOK_ME_URL}?${qs.stringify(params)}`
  const headers = { 'Content-Type': 'application/json' }

  const res = await fetch(url, { headers })

  if (!res.ok) {
    throw Error(res.statusText)
  }
  return res.json()
}
