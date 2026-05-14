import type { BetterAuthPlugin } from 'better-auth'
import { setSessionCookie } from 'better-auth/cookies'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { z } from 'zod'

import { DEFAULT_STUDID_BASE_URL, createVerification, pollVerification } from './api'
import { IDENTIFIER_TYPE_ORDER } from './types'
import type { StudidPluginOptions, StudidAuthResult, StudidCallbackState } from './types'

export type { StudidPluginOptions, StudidAuthResult } from './types'

function buildAccountId(entityId: string, authIdentifier: string): string {
  return `${entityId}::${authIdentifier}`
}

function buildUserEmail(accountId: string, emailDomain: string): string {
  const localPart = accountId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 64)
  return `${localPart}@${emailDomain}`
}

export function studid(options: StudidPluginOptions) {
  const {
    baseUrl = DEFAULT_STUDID_BASE_URL,
    serviceName,
    minIdentifierType = 'persistent-nameid',
    requirePersistent = true,
    callbackUrl,
    emailDomain = 'uni.verification',
    onSuccess,
  } = options

  const callbackPath = '/studid/callback'

  const buildResult = (
    entityId: string,
    authIdentifier: string | null,
    authIdentifierType: string | null,
    affiliations: string[],
  ): StudidAuthResult => ({
    entityId,
    authIdentifier,
    authIdentifierType: authIdentifierType as StudidAuthResult['authIdentifierType'],
    affiliations,
  })

  return {
    id: 'studid',
    schema: {
      user: {
        fields: {
          verifiedEntityId: { type: 'string', required: false },
          verifiedAuthIdentifier: { type: 'string', required: false },
          verifiedAffiliations: { type: 'string', required: false },
        },
      },
      session: {
        fields: {
          verifiedEntityId: { type: 'string', required: false },
          verifiedAffiliations: { type: 'string', required: false },
        },
      },
    },
    endpoints: {
      studidStart: createAuthEndpoint(
        '/studid/start',
        {
          method: 'GET',
          query: z.object({
            callbackURL: z.string().optional(),
          }),
        },
        async (ctx) => {
          const secretToken = crypto.randomUUID()
          const redirectUrl = callbackUrl || `${ctx.context.baseURL}${callbackPath}`
          const clientCallbackURL = ctx.query.callbackURL

          const { id: verificationId, link } = await createVerification(
            baseUrl,
            secretToken,
            redirectUrl,
            serviceName,
          )

          const state: StudidCallbackState = { verificationId, secretToken }
          if (clientCallbackURL) {
            state.callbackURL = clientCallbackURL
          }

          await ctx.setSignedCookie(
            'studid_state',
            JSON.stringify(state),
            ctx.context.secret,
            {
              maxAge: 60 * 30,
              path: '/',
              httpOnly: true,
              secure: ctx.context.baseURL?.startsWith('https') || false,
              sameSite: 'lax',
            },
          )

          return ctx.redirect(link)
        },
      ),
      studidCallback: createAuthEndpoint(
        callbackPath,
        {
          method: 'GET',
          query: z.object({ verificationId: z.string() }),
        },
        async (ctx) => {
          const { verificationId } = ctx.query

          const stateCookie = await ctx.getSignedCookie('studid_state', ctx.context.secret)
          if (!stateCookie) {
            throw new APIError('BAD_REQUEST', {
              message:
                'Your session expired or cookies were blocked. Please close this tab and try signing in again from the app.',
            })
          }

          let state: StudidCallbackState
          try {
            state = JSON.parse(stateCookie) as StudidCallbackState
          } catch {
            throw new APIError('BAD_REQUEST', {
              message:
                'Your session expired or cookies were blocked. Please close this tab and try signing in again from the app.',
            })
          }

          if (state.verificationId !== verificationId) {
            throw new APIError('BAD_REQUEST', {
              message:
                'Something went wrong with the verification. Please close this tab and start over from the app.',
            })
          }

          const result = await pollVerification(baseUrl, verificationId, state.secretToken)
          if (!result.session) {
            throw new APIError('BAD_REQUEST', {
              message: 'University login was not completed. Please try again from the app.',
            })
          }

          const { entityId, authIdentifier, authIdentifierType, affiliations } = result.session

          const minIndex = IDENTIFIER_TYPE_ORDER.indexOf(minIdentifierType)
          const actualIndex: number = authIdentifierType
            ? IDENTIFIER_TYPE_ORDER.indexOf(
                authIdentifierType as (typeof IDENTIFIER_TYPE_ORDER)[number],
              )
            : -1

          if (!authIdentifier || actualIndex > minIndex) {
            if (requirePersistent) {
              throw new APIError('BAD_REQUEST', {
                message: `Your institution returned a '${authIdentifierType}' identifier, but this app requires at least '${minIdentifierType}' for creating accounts.`,
              })
            }

            const url =
              typeof onSuccess === 'function'
                ? await onSuccess(buildResult(entityId, null, null, affiliations))
                : onSuccess || '/'
            return ctx.redirect(url)
          }

          const accountId = buildAccountId(entityId, authIdentifier)
          const existingAccount =
            await ctx.context.internalAdapter.findAccountByProviderId(accountId, 'studid')

          let user

          if (existingAccount) {
            const found = await ctx.context.internalAdapter.findUserById(existingAccount.userId)
            if (found) {
              await ctx.context.internalAdapter.updateUser(found.id, {
                verifiedEntityId: entityId,
                verifiedAuthIdentifier: authIdentifier,
                verifiedAffiliations: JSON.stringify(affiliations),
              })
              user = found
            }
          }

          if (!existingAccount || !user) {
            const email = buildUserEmail(accountId, emailDomain)
            user = await ctx.context.internalAdapter.createUser({
              email,
              emailVerified: true,
              name: entityId,
              verifiedEntityId: entityId,
              verifiedAuthIdentifier: authIdentifier,
              verifiedAffiliations: JSON.stringify(affiliations),
            })

            await ctx.context.internalAdapter.linkAccount({
              providerId: 'studid',
              accountId,
              userId: user.id,
            })
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
            {
              verifiedEntityId: entityId,
              verifiedAffiliations: JSON.stringify(affiliations),
            },
          )

          await setSessionCookie(ctx, { session, user })

          const resolvedURL = state.callbackURL
            || (typeof onSuccess === 'function'
              ? await onSuccess(buildResult(entityId, authIdentifier, authIdentifierType, affiliations))
              : onSuccess)
            || '/'

          return ctx.redirect(resolvedURL)
        },
      ),
    },
  } satisfies BetterAuthPlugin
}
