import * as Y from 'yjs'
import { PREFERRED_TRIM_SIZE, getMongoUpdates } from '../src/utils'
import { MongodbPersistence } from '../src/y-mongodb'
import * as t from 'lib0/testing.js'
// import * as decoding from 'lib0/decoding.js'

const location = 'mongodb://localhost:27017/y-mongodb-test'
const collection = 'mongodb://localhost:27017/y-transactions'

const flushUpdatesHelper = (ldb, docName, actions) => {
  return Promise.all(actions.map(action => ldb.storeUpdate(action.docName, action.update)))
};


export const testMongodbUpdateStorage = async tc => {
  const N = PREFERRED_TRIM_SIZE * 2

  const docName = tc.testName
  const ydoc1 = new Y.Doc()
  ydoc1.clientID = 0
  const dbPersistence = new MongodbPersistence(location, collection)
  await dbPersistence.clearDocument(docName)

  const updates = []

  ydoc1.on('update', async update => {
    updates.push({
      docName,
      update
    })
  });

  await flushUpdatesHelper(dbPersistence, docName, updates)

  const values = await dbPersistence._transact(db => getMongoUpdates(db, docName))
  for (let i = 0; i < values.length; i++) {
    t.assert(values[i].clock === i)
  }

  const yarray = ydoc1.getArray('arr')
  for (let i = 0; i < N; i++) {
    yarray.insert(0, [i])
  }

  await dbPersistence.flushDocument(docName)

  const mergedUpdates = await dbPersistence._transact(db => getMongoUpdates(db, docName))
  t.assert(mergedUpdates.length === 1)

  await dbPersistence.flushDB();
};
