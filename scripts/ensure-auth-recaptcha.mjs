#!/usr/bin/env node
/**
 * Enables Firebase Auth phone reCAPTCHA Enterprise (SMS bot score / AUDIT) and
 * ensures the Identity Toolkit service agent can manage keys.
 *
 * Fixes client errors like "recaptchaKey undefined" / blank
 * enterprise.js?render= when Auth has no Enterprise key provisioned.
 *
 * Prerequisites: gcloud auth login (user with project owner / security admin)
 *
 *   npm run setup:auth-recaptcha
 */
import { execFileSync } from 'node:child_process'

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? 'talkitthrough-12076'

function gcloudJson(args) {
  const out = execFileSync('gcloud', [...args, '--format=json', `--project=${projectId}`], {
    encoding: 'utf8',
  })
  return out.trim() ? JSON.parse(out) : null
}

function gcloud(args) {
  execFileSync('gcloud', [...args, `--project=${projectId}`, '--quiet'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function accessToken() {
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
}

async function api(method, path, body) {
  const res = await fetch(`https://identitytoolkit.googleapis.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'x-goog-user-project': projectId,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message ?? res.statusText)
  }
  return json
}

const number = gcloudJson(['projects', 'describe', projectId]).projectNumber
const identitySa = `service-${number}@gcp-sa-identitytoolkit.iam.gserviceaccount.com`

console.log(`Project ${projectId} (${number})`)

const token = accessToken()
const identityRes = await fetch(
  `https://serviceusage.googleapis.com/v1beta1/projects/${projectId}/services/identitytoolkit.googleapis.com:generateServiceIdentity`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': projectId,
      'Content-Type': 'application/json',
    },
    body: '{}',
  },
)
const identityJson = await identityRes.json()
if (!identityRes.ok && identityJson.error?.status !== 'ALREADY_EXISTS') {
  console.warn('generateServiceIdentity:', identityJson.error?.message ?? identityJson)
} else {
  console.log('Identity Toolkit service agent:', identityJson.response?.email ?? identitySa)
}

for (const role of ['roles/recaptchaenterprise.agent', 'roles/recaptchaenterprise.admin']) {
  try {
    gcloud([
      'projects',
      'add-iam-policy-binding',
      projectId,
      `--member=serviceAccount:${identitySa}`,
      `--role=${role}`,
      '--condition=None',
    ])
    console.log(`Granted ${role} to ${identitySa}`)
  } catch (error) {
    console.warn(`Could not grant ${role}:`, error.message?.slice?.(0, 120) ?? error)
  }
}

const updated = await api(
  'PATCH',
  `/admin/v2/projects/${projectId}/config?updateMask=recaptchaConfig,authorizedDomains`,
  {
    recaptchaConfig: {
      phoneEnforcementState: 'AUDIT',
      useSmsBotScore: true,
      recaptchaKeys: [],
    },
    authorizedDomains: [
      'localhost',
      `${projectId}.firebaseapp.com`,
      `${projectId}.web.app`,
      'changemymind.tech',
      'www.changemymind.tech',
    ],
  },
)

console.log('\nAuth recaptchaConfig:', JSON.stringify(updated.recaptchaConfig ?? null, null, 2))
console.log('Authorized domains:', updated.authorizedDomains)

const webApiKey = process.env.VITE_FIREBASE_API_KEY ?? updated.client?.apiKey ?? ''
if (webApiKey) {
  const probe = await fetch(
    `https://identitytoolkit.googleapis.com/v2/recaptchaConfig?key=${encodeURIComponent(webApiKey)}&clientType=CLIENT_TYPE_WEB&version=RECAPTCHA_ENTERPRISE`,
  )
  const probeJson = await probe.json()
  console.log('\nClient recaptchaKey:', probeJson.recaptchaKey ?? probeJson.error ?? probeJson)
}

console.log(
  '\nDone. Hard-refresh the app and try phone sign-in. If render= is still blank, wait a minute for key propagation.',
)
