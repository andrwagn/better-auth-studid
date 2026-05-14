import type { StudidVerificationResult } from './types'

export const DEFAULT_STUDID_BASE_URL = 'https://studid.io'

export async function createVerification(
  baseUrl: string,
  secretToken: string,
  redirectUrl: string,
  serviceName: string,
): Promise<{ id: string; link: string }> {
  const response = await fetch(`${baseUrl}/v2/auth/verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secretToken, redirectUrl, serviceName }),
  })
  if (!response.ok) {
    throw new Error(`Studid API error: ${response.status} ${response.statusText}`)
  }
  const data = await response.json()
  return { id: data.id, link: data.link }
}

export async function getVerification(
  baseUrl: string,
  verificationId: string,
  secretToken: string,
): Promise<StudidVerificationResult> {
  const url = `${baseUrl}/v2/auth/verification/${verificationId}?id=${verificationId}&secretToken=${secretToken}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Studid API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function pollVerification(
  baseUrl: string,
  verificationId: string,
  secretToken: string,
  maxAttempts = 30,
  delayMs = 1000,
): Promise<StudidVerificationResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getVerification(baseUrl, verificationId, secretToken)
    if (result.session) return result
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw new Error('Verification timed out')
}
