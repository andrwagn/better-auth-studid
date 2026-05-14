export interface StudidPluginOptions {
  baseUrl?: string
  serviceName: string
  minIdentifierType?: 'pairwise-id' | 'persistent-nameid' | 'email' | 'none'
  requirePersistent?: boolean
  callbackUrl?: string
  emailDomain?: string
  onSuccess?: string | ((data: StudidAuthResult) => string | Promise<string>)
}

export interface StudidAuthResult {
  entityId: string
  authIdentifier: string | null
  authIdentifierType: 'pairwise-id' | 'persistent-nameid' | 'email' | null
  affiliations: string[]
}

export interface StudidSession {
  entityId: string
  affiliations: string[]
  authIdentifier: string | null
  authIdentifierType: 'pairwise-id' | 'persistent-nameid' | 'email' | null
}

export interface StudidVerificationResult {
  id: string
  created: string
  session: StudidSession | null
}

export interface StudidCallbackState {
  verificationId: string
  secretToken: string
  callbackURL?: string
}

export const IDENTIFIER_TYPE_ORDER = [
  'pairwise-id',
  'persistent-nameid',
  'email',
  'none',
] as const
