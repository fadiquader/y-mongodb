import * as Y from 'yjs'
import * as binary from 'lib0/binary.js'
import * as encoding from 'lib0/encoding.js'
import { Buffer } from 'buffer'

export const PREFERRED_TRIM_SIZE = 400

/**
 * @param {any} db
 * @param {string} docName
 * @param {number} from Greater than or equal
 * @param {number} to lower than (not equal)
 * @return {Promise<void>}
 */
export const clearUpdatesRange = async (db, docName, from, to) => db.del({
  docName,
  clock: {
    $gte: from,
    $lt: to
  }
})

/**
 * @param {any} db
 * @param {string} docName
 * @param {Uint8Array} stateAsUpdate
 * @param {Uint8Array} stateVector
 * @return {Promise<number>} returns the clock of the flushed doc
 */
export const flushDocument = async (db, docName, stateAsUpdate, stateVector) => {
  const clock = await storeUpdate(db, docName, stateAsUpdate)
  await writeStateVector(db, docName, stateVector, clock)
  await clearUpdatesRange(db, docName, 0, clock)
  return clock
}

/**
 * Create a unique key for a update message.
 * @param {string} docName
 * @param {number} clock must be unique
 * @return {Object} [opts.version, opts.docName, opts.action, opts.clock]
 */
export const createDocumentUpdateKey = (docName, clock) => ({
  version: 'v1',
  action: 'update',
  docName,
  clock
})

/**
 * @param {string} docName
 * @return {Object} [opts.docName, opts.version]
 */
export const createDocumentStateVectorKey = docName => {
  return {
    docName: docName,
    version: 'v1_sv'
  }
}

/**
 * Level expects a Buffer, but in Yjs we typically work with Uint8Arrays.
 *
 * Since Level thinks that these are two entirely different things,
 * we transform the Uint8array to a Buffer before storing it.
 *
 * @param {any} db
 * @param {Object} values
 */
export const mongoPut = async (db, values) => db.put(values)

/**
 * @param {any} db
 * @param {object} query
 * @param {object} opts
 * @return {Promise<Array<any>>}
 */
export const getMongoBulkData = (db, query, opts) => db.readAsCursor(query, opts)

/**
 * @param {any} db
 * @return {Promise<any>}
 */
export const flushDB = db => db.flush()

/**
 * Get all document updates for a specific document.
 *
 * @param {any} db
 * @param {string} docName
 * @param {any} [opts]
 * @return {Promise<Array<Object>>}
 */
export const getMongoUpdates = async (db, docName, opts = {}) => getMongoBulkData(db, {
  ...createDocumentUpdateKey(docName, 0),
  clock: {
    $gte: 0,
    $lt: binary.BITS32
  }
},
opts
)

/**
 * @param {any} db
 * @param {string} docName
 * @return {Promise<number>} Returns -1 if this document doesn't exist yet
 */
export const getCurrentUpdateClock = (db, docName) => getMongoUpdates(db, docName, {
  reverse: true,
  limit: 1
}).then(updates => {
  if (updates.length === 0) {
    return -1
  } else {
    return updates[0].clock
  }
})

/**
 * @param {any} db
 * @param {string} docName
 * @param {Uint8Array} sv state vector
 * @param {number} clock current clock of the document so we can determine when this statevector was created
 */
export const writeStateVector = async (db, docName, sv, clock) => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint8Array(encoder, sv)
  await mongoPut(db, {
    ...createDocumentStateVectorKey(docName),
    value: Buffer.from(encoding.toUint8Array(encoder)),
    clock
  })
}

/**
 * @param {any} db
 * @param {string} docName
 * @param {Uint8Array} update
 * @return {Promise<number>} Returns the clock of the stored update
 */
export const storeUpdate = async (db, docName, update) => {
  const clock = await getCurrentUpdateClock(db, docName)
  if (clock === -1) {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, update)
    const sv = Y.encodeStateVector(ydoc)
    await writeStateVector(db, docName, sv, 0)
  }

  await mongoPut(db, {
    ...createDocumentUpdateKey(docName, clock + 1),
    value: Buffer.from(update)
  })

  return clock + 1
}

/**
 * @param {Array<Uint8Array>} updates
 * @return {{update:Uint8Array, sv: Uint8Array}}
 */
export const mergeUpdates = (updates) => {
  const ydoc = new Y.Doc()
  ydoc.transact(() => {
    for (let i = 0; i < updates.length; i++) {
      Y.applyUpdate(ydoc, updates[i])
    }
  })
  return { update: Y.encodeStateAsUpdate(ydoc), sv: Y.encodeStateVector(ydoc) }
}
