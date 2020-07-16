
# Mongodb database adapter for [Yjs](https://github.com/yjs/yjs)
Persistent Mongodb storage for [y-websocket](https://github.com/yjs/y-websocket) server

### Notes:
* It is a fork of  [Y-leveldb](https://github.com/yjs/y-leveldb)
* is not official.
* Still under progress.

## Use it
```sh
npm install y-mongodb --save
```

#### create a simple server
```js
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const { MongodbPersistence } = require('y-mongodb');
const utils = require('y-websocket/bin/utils.js');

const location = process.env.MONGODB_URI;
const collection = 'yjs-transactions';
const ldb = new MongodbPersistence(location, collection);

const production = process.env.PRODUCTION != null;
const port = process.env.PORT || 8080;


const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('okay');
});


// const wss = new WebSocket.Server({ server });
const wss = new WebSocket.Server({  noServer: true });

wss.on('connection', utils.setupWSConnection);
server.on('upgrade', (request, socket, head) => {
  // You may check auth of request here..
  /**
   * @param {any} ws
   */
  const handleAuth = ws => {
    wss.emit('connection', ws, request)
  }
  wss.handleUpgrade(request, socket, head, handleAuth)
});

/*
 Persistence must have the following signature:
{ bindState: function(string,WSSharedDoc):void, writeState:function(string,WSSharedDoc):Promise }
*/
utils.setPersistence({
  bindState: async (docName, ydoc) => {
    // Here you listen to granular document updates and store them in the database
    // You don't have to do this, but it ensures that you don't lose content when the server crashes
    // See https://github.com/yjs/yjs#Document-Updates for documentation on how to encode 
    // document updates
        
    const persistedYdoc = await ldb.getYDoc(docName);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    ldb.storeUpdate(docName, newUpdates)
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on('update', async update => {
      ldb.storeUpdate(docName, update);
    })
  },
  writeState: async (docName, ydoc) => {
    // This is called when all connections to the document are closed.
    // In the future, this method might also be called in intervals or after a certain number of updates.
    return new Prosime(resolve => {
      // When the returned Promise resolves, the document will be destroyed.
      // So make sure that the document really has been written to the database.
      resolve()
    })
  }
})

server.listen(port);

console.log(`Listening to http://localhost:${port} ${production ? '(production)' : ''}`)

```


## API

### `persistence = MongodbPersistence(mongoUril, collection)`

Create a mongo persistence instance.

#### `persistence.getYDoc(docName: string): Promise<Y.Doc>`

Create a Y.Doc instance with the data stored in mongodb.

#### `persistence.storeUpdate(docName: string, update: Uint8Array): Promise`
Store a transaction to the database.

#### `persistence.clearDocument(docName: string): Promise`
Delete a document, and all associated data from the database.
