import { AddressInfo, createConnection, createServer, Server, Socket } from 'net';
import { once } from 'events';
import { assert } from 'chai';
import { promisify } from 'util';
import DuplexPair from 'native-duplexpair';
import { TLSSocket } from 'tls';
import { readFileSync } from 'fs';
import { Duplex } from 'stream';

import Debug from '../../src/debug';
import MessageIO from '../../src/message-io';
import Message from '../../src/message';
import { Packet, TYPE } from '../../src/packet';

const packetType = 2;
const packetSize = 8 + 4;

const delay = promisify(setTimeout);

describe('MessageIO', function() {
  let server: Server;
  let serverConnection: Socket;
  let clientConnection: Socket;

  let debug: Debug;

  beforeEach(function(done) {
    debug = new Debug();

    server = createServer();
    server.listen(0, done);
  });

  beforeEach(async function() {
    [serverConnection, clientConnection] = await Promise.all([
      new Promise<Socket>((resolve) => {
        server.once('connection', (c) => {
          resolve(c);
        });
      }),

      new Promise<Socket>((resolve) => {
        const c = createConnection((server.address() as AddressInfo).port, 'localhost', () => {
          resolve(c);
        });
      })
    ]);
  });

  afterEach(function() {
    serverConnection.destroy();
    clientConnection.destroy();
  });

  afterEach(function(done) {
    server.close(done);
  });

  describe('#sendMessage', function() {
    it('sends data that is smaller than the current packet length', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Server side
        (async () => {
          await once(serverConnection, 'readable');

          let chunk: Buffer;
          const chunks = [];

          while (chunk = serverConnection.read()) {
            chunks.push(chunk);
          }

          const data = Buffer.concat(chunks);
          assert.lengthOf(data, 11);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);
          io.sendMessage(packetType, payload);
        })()
      ]);
    });

    it('sends data that matches the current packet length', async function() {
      const payload = Buffer.from([1, 2, 3, 4]);

      await Promise.all([
        // Server side
        (async () => {
          await once(serverConnection, 'readable');

          let chunk: Buffer;
          const chunks = [];

          while (chunk = serverConnection.read()) {
            chunks.push(chunk);
          }

          const data = Buffer.concat(chunks);
          assert.lengthOf(data, 12);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);
          io.sendMessage(packetType, payload);
        })()
      ]);
    });

    it('sends data that is larger than the current packet length', async function() {
      const payload = Buffer.from([1, 2, 3, 4, 5]);

      await Promise.all([
        // Server side
        (async () => {
          // Wait for data to become available
          await once(serverConnection, 'readable');

          let chunk: Buffer;
          const chunks = [];

          while (chunk = serverConnection.read()) {
            chunks.push(chunk);
          }

          const data = Buffer.concat(chunks);
          assert.lengthOf(data, 21);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);
          io.sendMessage(packetType, payload);
        })()
      ]);
    });
  });

  describe('#readMessage', function() {
    it('reads data that is sent in a single packet', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Server side
        (async () => {
          const packet = new Packet(packetType);
          packet.last(true);
          packet.addData(payload);

          serverConnection.write(packet.buffer);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const chunks = [];
          for await (const chunk of message) {
            chunks.push(chunk);
          }

          assert.deepEqual(chunks, [ payload ]);
        })()
      ]);
    });

    it('reads data that is sent in a single packet but split into separate chunks', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Server side
        (async () => {
          const packet = new Packet(packetType);
          packet.last(true);
          packet.addData(payload);

          serverConnection.write(packet.buffer.slice(0, 4));
          serverConnection.write(packet.buffer.slice(4));
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const chunks = [];
          for await (const chunk of message) {
            chunks.push(chunk);
          }

          assert.deepEqual(chunks, [ payload ]);
        })()
      ]);
    });

    it('reads data that is sent across multiple packets', async function() {
      const payload = Buffer.from([1, 2, 3]);
      const payload1 = payload.slice(0, 2);
      const payload2 = payload.slice(2, 3);

      await Promise.all([
        // Server side
        (async () => {
          let packet = new Packet(packetType);
          packet.addData(payload1);

          serverConnection.write(packet.buffer);

          await delay(5);

          packet = new Packet(packetType);
          packet.last(true);
          packet.addData(payload2);

          serverConnection.write(packet.buffer);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const receivedData: Buffer[] = [];
          for await (const chunk of message) {
            receivedData.push(chunk);
          }

          assert.deepEqual(receivedData, [
            payload1,
            payload2
          ]);
        })()
      ]);
    });

    it('reads data that is sent across multiple packets, with a chunk containing parts of different packets', async function() {
      const payload = Buffer.from([1, 2, 3]);
      const payload1 = payload.slice(0, 2);
      const payload2 = payload.slice(2, 3);

      await Promise.all([
        // Server side
        (async () => {
          const packet1 = new Packet(packetType);
          packet1.addData(payload.slice(0, 2));

          const packet2 = new Packet(packetType);
          packet2.last(true);
          packet2.addData(payload.slice(2, 4));

          serverConnection.write(packet1.buffer.slice(0, 6));

          await delay(5);

          serverConnection.write(Buffer.concat([packet1.buffer.slice(6), packet2.buffer.slice(0, 4)]));

          await delay(5);

          serverConnection.write(packet2.buffer.slice(4));
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const receivedData: Buffer[] = [];
          for await (const chunk of message) {
            receivedData.push(chunk);
          }

          assert.deepEqual(receivedData, [
            payload1,
            payload2
          ]);
        })(),
      ]);
    });

    it('reads data that is sent across multiple packets, with a chunk containing multiple packets', async function() {
      const payload = Buffer.from([1, 2, 3, 4, 5, 6]);

      await Promise.all([
        // Server side
        (async () => {
          const packet1 = new Packet(packetType);
          packet1.addData(payload.slice(0, 2));

          const packet2 = new Packet(packetType);
          packet2.addData(payload.slice(2, 4));

          const packet3 = new Packet(packetType);
          packet3.last(true);
          packet3.addData(payload.slice(4, 6));

          const allData = Buffer.concat([packet1.buffer, packet2.buffer, packet3.buffer]);
          const data1 = allData.slice(0, 5);
          const data2 = allData.slice(5);

          serverConnection.write(data1);

          await delay(5);

          serverConnection.write(data2);
        })(),

        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          const message = await io.readMessage();
          assert.instanceOf(message, Message);

          const receivedData: Buffer[] = [];
          for await (const chunk of message) {
            receivedData.push(chunk);
          }

          // The data of the individual packages gets merged together by the buffering happening
          // inside the `IncomingMessageStream`. We don't actually care about this, so it's
          // okay if this changes.
          assert.deepEqual(receivedData, [ payload ]);
        })()
      ]);
    });
  });

  describe('#startTls', function() {
    let securePair: { encrypted: Duplex, cleartext: TLSSocket };

    beforeEach(function() {
      const duplexpair = new DuplexPair();

      securePair = {
        cleartext: new TLSSocket(duplexpair.socket1 as Socket, {
          key: readFileSync('./test/fixtures/localhost.key'),
          cert: readFileSync('./test/fixtures/localhost.crt'),
          isServer: true,
          ciphers: 'ECDHE-RSA-AES128-GCM-SHA256',
          // TDS 7.x only supports TLS versions up to TLS v1.2
          maxVersion: 'TLSv1.2'
        }),
        encrypted: duplexpair.socket2
      };
    });

    afterEach(function() {
      securePair.cleartext.destroy();
      securePair.encrypted.destroy();
    });

    it('performs TLS negotiation', async function() {
      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          await io.startTls({}, 'localhost', true);

          assert(io.tlsNegotiationComplete);
        })(),

        // Server side
        (async () => {
          const io = new MessageIO(serverConnection, packetSize, debug);

          // The server side TLS socket emits a `secure` event
          // once TLS handshaking was completed.
          const onSecure = once(securePair.cleartext, 'secure');

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          // Verify that server side was successful at this point
          await onSecure;
        })()
      ]);
    });

    it('sends and receives data via TLS after successful TLS negotiation', async function() {
      const payload = Buffer.from([1, 2, 3]);

      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          await io.startTls({}, 'localhost', true);

          // Send a request (via TLS)
          io.sendMessage(TYPE.LOGIN7, payload);

          // Receive response (via TLS)
          const message = await io.readMessage();

          const chunks: Buffer[] = [];
          for await (const chunk of message) {
            chunks.push(chunk);
          }

          assert.deepEqual(Buffer.concat(chunks), payload);
        })(),

        // Server side
        (async () => {
          const io = new MessageIO(serverConnection, packetSize, debug);

          // The server side TLS socket emits a `secure` event
          // once TLS handshaking was completed.
          const onSecure = once(securePair.cleartext, 'secure');

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          {
            const message = await io.readMessage();
            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }

          // Verify that server side was successful at this point
          await onSecure;

          // Set up TLS encryption
          serverConnection.pipe(securePair.encrypted);
          securePair.encrypted.pipe(serverConnection);

          // Wait for client request
          await once(securePair.cleartext, 'readable');

          {
            const chunks: Buffer[] = [];
            let chunk;
            while (chunk = securePair.cleartext.read()) {
              chunks.push(chunk);
            }

            const data = Buffer.concat(chunks);
            assert.lengthOf(data, 11);

            // Send a response
            const packet = new Packet(TYPE.LOGIN7);
            packet.addData(payload);
            packet.last(true);
            securePair.cleartext.write(packet.buffer);
          }
        })()
      ]);
    });

    it('handles errors happening before TLS negotiation has sent any data', async function() {
      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          let hadError = false;
          try {
            await io.startTls({
              // Use a cipher that causes an error immediately
              ciphers: 'NULL'
            }, 'localhost', true);
          } catch (err: any) {
            hadError = true;

            assert.instanceOf(err, Error);
            assert.strictEqual(err.code, 'ERR_SSL_NO_CIPHERS_AVAILABLE');
            assert.strictEqual(err.reason, 'no ciphers available');
          }

          assert(hadError);
        })(),

        // Server side
        (async () => {
          // Does nothing...
        })()
      ]);
    });

    it('handles errors that happen during TLS negotiation', async function() {
      await Promise.all([
        // Client side
        (async () => {
          const io = new MessageIO(clientConnection, packetSize, debug);

          let hadError = false;
          try {
            await io.startTls({
              // Use some cipher that's not supported on the server side
              ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256'
            }, 'localhost', true);
          } catch (err: any) {
            hadError = true;

            assert.instanceOf(err, Error);
            assert.strictEqual(err.code, 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE');
            assert.strictEqual(err.reason, 'sslv3 alert handshake failure');
          }

          assert(hadError);
        })(),

        // Server side
        (async () => {
          const io = new MessageIO(serverConnection, packetSize, debug);

          {
            const message = await io.readMessage();

            for await (const chunk of message) {
              securePair.encrypted.write(chunk);
            }

            await once(securePair.encrypted, 'readable');

            const chunks = [];
            let chunk;
            while (chunk = securePair.encrypted.read()) {
              chunks.push(chunk);
            }

            io.sendMessage(TYPE.PRELOGIN, Buffer.concat(chunks));
          }
        })()
      ]);
    });
  });
});
