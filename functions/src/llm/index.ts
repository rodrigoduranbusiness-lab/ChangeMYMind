import { AI_PROVIDER } from '../config'
import { runSessionJudgeGrok, runTakeawaysGrok } from './grokJudge'
import { formatTranscript } from './transcript'
import {
  runSessionJudgeVertex,
  runTakeawaysVertex,
  type SessionJudgeParams,
  type TakeawaysParams,
} from './vertexJudge'

export { formatTranscript, type SessionJudgeParams, type TakeawaysParams }

export async function runSessionJudge(params: SessionJudgeParams) {
  if (AI_PROVIDER === 'grok') {
    return runSessionJudgeGrok(params)
  }
  return runSessionJudgeVertex(params)
}

export async function runTakeaways(params: TakeawaysParams) {
  if (AI_PROVIDER === 'grok') {
    return runTakeawaysGrok(params)
  }
  return runTakeawaysVertex(params)
}
