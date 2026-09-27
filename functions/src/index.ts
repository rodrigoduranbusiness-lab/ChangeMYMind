import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'

import { REGION } from './config'

/** Matches Secret Manager name created in Firebase / GCP console. */
const xaiApiKey = defineSecret('X_AI_API_KEY')

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
  secrets: [xaiApiKey],
})

export {
  abandonSession,
  finalizeSession,
  reportPause,
  startSession,
  submitTurn,
  syncTranscript,
} from './sessions'

export { deleteAccount } from './accounts'

export { mintLiveAccess } from './live'
export { reportConduct } from './sessions'
