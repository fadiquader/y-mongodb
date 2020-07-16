import * as Y from 'yjs'
import * as binary from 'lib0/binary.js'
import * as promise from 'lib0/promise.js'
//
import { MongoAdapter } from './mongo-adapter'
import * as U from './utils'

const getUpdates = docs => {
  if (!Array.isArray(docs) || !docs.length) return []

  return docs.map(update => update.value.buffer)
}

export class MongodbPersistence {
  /**
   * @param {string} location
   * @param {string} [collection]
   */
  constructor (location, collection) {
    const db = new MongoAdapter(location, collection)
    this.tr = promise.resolve()

    this._transact = f => {
      const currTr = this.tr
      this.tr = (async () => {
        await currTr
        let res = /** @type {any} */ (null)
        try {
          res = await f(db)
        } catch (err) {
          console.warn('Error during saving transaction', err)
        }
        return res
      })()
      return this.tr
    }
  }

  /**
   * @param {string} docName
   * @return {Promise<Y.Doc>}
   */
  getYDoc (docName) {
    return this._transact(async db => {
      const docs = await U.getMongoUpdates(db, docName)
      const updates = getUpdates(docs)
      const ydoc = new Y.Doc()
      ydoc.transact(() => {
        for (let i = 0; i < updates.length; i++) {
          Y.applyUpdate(ydoc, updates[i])
        }
      })
      if (updates.length > U.PREFERRED_TRIM_SIZE) {
        await U.flushDocument(db, docName, Y.encodeStateAsUpdate(ydoc), Y.encodeStateVector(ydoc))
      }
      return ydoc
    })
  }

  /**
   * @param {string} docName
   * @param {Uint8Array} update
   * @return {Promise<number>} Returns the clock of the stored update
   */
  storeUpdate (docName, update) {
    return this._transact(db => U.storeUpdate(db, docName, update))
  }

  /**
   * @param {string} docName
   * @return {Promise<void>}
   */
  clearDocument (docName) {
    return this._transact(async db => {
      await db.del(U.createDocumentStateVectorKey(docName))
      await U.clearUpdatesRange(db, docName, 0, binary.BITS32)
    })
  }

  /**
   * @param {string} docName
   * @return {Promise<void>}
   */
  flushDocument (docName) {
    return this._transact(async db => {
      const docs = await U.getMongoUpdates(db, docName)
      const updates = getUpdates(docs)
      const { update, sv } = U.mergeUpdates(updates)
      await U.flushDocument(db, docName, update, sv)
    })
  }

  flushDB () {
    return this._transact(async db => {
      await U.flushDB(db)
    })
  }
}
