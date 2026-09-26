import { setGlobalOptions } from 'firebase-functions/v2'

import { REGION } from './config'

setGlobalOptions({ region: REGION, maxInstances: 10 })

export {
  abandonSession,
  finalizeSession,
  reportPause,
  startSession,
  submitTurn,
} from './sessions'

export { deleteAccount } from './accounts'

export { mintLiveAccess } from './liveAccess'
export { reportConduct } from './sessions'
