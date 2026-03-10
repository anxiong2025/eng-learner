import * as jose from 'jose'
import type { Context } from 'hono'
import type { Env, AuthUser } from '../env'

/** JWT Claims structure */
interface JwtClaims {
  sub: string
  email: string
  name: string
  avatar?: string
  provider: string
  tier: string
  exp: number
  iat: number
}

/** Get JWT secret as Uint8Array */
function getSecret(env: Env): Uint8Array {
  const secret = env.JWT_SECRET || 'eng-learner-dev-secret-change-in-production'
  return new TextEncoder().encode(secret)
}

/** Generate a JWT token for a user */
export async function generateToken(
  user: {
    user_id: string
    email: string
    name: string
    avatar?: string
    provider: string
    tier: string
  },
  env: Env,
): Promise<string> {
  const secret = getSecret(env)
  const token = await new jose.SignJWT({
    sub: user.user_id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    provider: user.provider,
    tier: user.tier,
  } as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)

  return token
}

/** Verify and decode a JWT token */
export async function verifyToken(token: string, env: Env): Promise<AuthUser | null> {
  try {
    const secret = getSecret(env)
    const { payload } = await jose.jwtVerify(token, secret)
    const claims = payload as unknown as JwtClaims

    return {
      user_id: claims.sub,
      email: claims.email,
      name: claims.name,
      avatar: claims.avatar,
      provider: claims.provider,
      tier: claims.tier,
    }
  } catch {
    return null
  }
}

/** Extract auth user from request (returns null if not authenticated) */
export async function getAuthUser(c: Context<{ Bindings: Env }>): Promise<AuthUser | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  return verifyToken(token, c.env)
}

/** Get auth user or default values for unauthenticated requests */
export async function getOptionalAuth(
  c: Context<{ Bindings: Env }>,
): Promise<{ user_id: string; tier: string; isLoggedIn: boolean; user: AuthUser | null }> {
  const user = await getAuthUser(c)
  return {
    user_id: user?.user_id ?? 'default',
    tier: user?.tier ?? 'free',
    isLoggedIn: user !== null,
    user,
  }
}

/** Require auth - return 401 if not authenticated */
export async function requireAuth(
  c: Context<{ Bindings: Env }>,
): Promise<AuthUser | Response> {
  const user = await getAuthUser(c)
  if (!user) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401)
  }
  return user
}
