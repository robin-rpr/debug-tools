'use strict'
const asyncHooks = require('async_hooks')
const { performance } = require('perf_hooks')
const { cleanHooksStackMeta } = require('./lib/cleanStack')
const { printMessage } = require('./lib/print')
const filePath = process.env.AID_HOOK_SCOPE


const data = new Map()
const depthCache = {}
function getDepthFor(asyncId, triggerAsyncId) {
  const value = (depthCache[triggerAsyncId] || 0) + 1
  depthCache[asyncId] = value
  return value
}
function getFunctionId(stack, asyncId) {
  // debugLog(cleanHooksStack(stack))
  const meta = cleanHooksStackMeta(stack)
  let clean = meta.frames[0]
  if (clean.split('(')[1][0] !== '/') {
    printMessage(`COULD NOT PROCESS STACKTRACE ${asyncId} ${stack.split('\n').slice(2).join('\n')}`)
  }
  if (meta.wasAnon) {
    clean = meta.wasAnon + clean
  }
  if (meta.wasConsole) {
    clean = '    at console called' + clean
  }
  return clean.replace('    at ', '')
}
Error.stackTraceLimit = Math.max(Error.stackTraceLimit, 20)
const asyncHook = asyncHooks.createHook({
  init(asyncId, type, triggerAsyncId) {
    const e = {}
    Error.captureStackTrace(e)
    if (data.has(triggerAsyncId) || e.stack.includes(filePath)) {
      const funcId = getFunctionId(e.stack, asyncId)
      data.set(asyncId, { funcId, triggerAsyncId, depth: getDepthFor(asyncId, triggerAsyncId) })
    }
  },

  before(asyncId) {
    const info = data.get(asyncId)
    if (!info) return

    performance.mark('b' + asyncId)
  },

  after(asyncId) {
    const info = data.get(asyncId)
    if (!info) return

    performance.mark('a' + asyncId)
    const prefix = ' '.repeat(info.depth - 1) + '└'
    printMessage(`${prefix}[${info.triggerAsyncId}->${asyncId}] ${info.funcId}`)
    performance.measure(`[${info.triggerAsyncId}->${asyncId}] ${info.funcId}`, 'b' + asyncId, 'a' + asyncId)
  }
//TODO add destroy to clean up data in case node reuses sayncIds
})

asyncHook.enable()
