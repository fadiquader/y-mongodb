
import * as mongodb from './y-mongodb.tests.js'

import { runTests } from 'lib0/testing.js'
import { isNode } from 'lib0/environment.js'

if (isNode) {
  runTests({
    mongodb
  }).then(success => {
    process.exit(success ? 0 : 1)
  })

}
