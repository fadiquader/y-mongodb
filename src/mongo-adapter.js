import mongojs from 'mongojs'
import mongoist from 'mongoist'

export class MongoAdapter {
  constructor (location, collection) {
    this.location = location
    this.collection = collection || 'yjs-writings'
    this.db = null
    this.open()
  }

  open () {
    const mongojsDb = mongojs(this.location, [this.collection])
    this.db = mongoist(mongojsDb)
  }

  get (query) {
    return this.db[this.collection].findOne(query)
  }

  put (values) {
    if (!values.docName && !values.version && !values.value) { throw new Error('Document and version must be provided') }

    return this.db[this.collection].save(values)
  }

  del (query) {
    const bulk = this.db[this.collection].initializeOrderedBulkOp()
    bulk.find(query).remove()
    return bulk.execute()
  }

  readAsCursor (query, opts = {}) {
    let curs = this.db[this.collection].findAsCursor(query)
    if (opts.reverse) curs = curs.sort({ clock: -1 })
    if (opts.limit) curs = curs.limit(opts.limit)
    return curs.toArray()
  }

  close () {
    this.db.close()
  }

  async flush () {
    await this.db.dropDatabase()
    await this.db.close()
  }
}
