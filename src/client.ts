import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { studid } from './index'

export function studidClient() {
  return {
    id: 'studid',
    $InferServerPlugin: {} as ReturnType<typeof studid>,
    getActions: () => ({
      signIn: {
        studid: async (options?: { callbackURL?: string; newTab?: boolean }) => {
          const url = '/api/auth/studid/start'
          if (typeof window !== 'undefined') {
            if (options?.newTab) {
              window.open(url, '_blank')
              return { url }
            }
            if (options?.callbackURL) {
              window.location.href = `${url}?callbackURL=${encodeURIComponent(options.callbackURL)}`
            } else {
              window.location.href = url
            }
          }
          return { url }
        },
      },
    }),
  } satisfies BetterAuthClientPlugin
}
