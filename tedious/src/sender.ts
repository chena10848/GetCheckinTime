import dgram from 'dgram';
import dns from 'dns';
import net from 'net';
import * as punycode from 'punycode';
import { AbortSignal } from 'node-abort-controller';

import AbortError from './errors/abort-error';

type LookupFunction = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

export async function sendInParallel(addresses: dns.LookupAddress[], port: number, request: Buffer, signal: AbortSignal) {
  if (signal.aborted) {
    throw new AbortError();
  }

  return await new Promise<Buffer>((resolve, reject) => {
    const sockets: dgram.Socket[] = [];

    let errorCount = 0;

    const onError = (err: Error) => {
      errorCount++;

      if (errorCount === addresses.length) {
        signal.removeEventListener('abort', onAbort);
        clearSockets();

        reject(err);
      }
    };

    const onMessage = (message: Buffer) => {
      signal.removeEventListener('abort', onAbort);
      clearSockets();

      resolve(message);
    };

    const onAbort = () => {
      clearSockets();

      reject(new AbortError());
    };

    const clearSockets = () => {
      for (const socket of sockets) {
        socket.removeListener('error', onError);
        socket.removeListener('message', onMessage);
        socket.close();
      }
    };

    signal.addEventListener('abort', onAbort, { once: true });

    for (let j = 0; j < addresses.length; j++) {
      const udpType = addresses[j].family === 6 ? 'udp6' : 'udp4';

      const socket = dgram.createSocket(udpType);
      sockets.push(socket);
      socket.on('error', onError);
      socket.on('message', onMessage);
      socket.send(request, 0, request.length, port, addresses[j].address);
    }
  });
}

export async function sendMessage(host: string, port: number, lookup: LookupFunction, signal: AbortSignal, request: Buffer) {
  if (signal.aborted) {
    throw new AbortError();
  }

  let addresses: dns.LookupAddress[];

  if (net.isIP(host)) {
    addresses = [
      { address: host, family: net.isIPv6(host) ? 6 : 4 }
    ];
  } else {
    addresses = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
      const onAbort = () => {
        reject(new AbortError());
      };

      signal.addEventListener('abort', onAbort);

      lookup(punycode.toASCII(host), { all: true }, (err, addresses) => {
        signal.removeEventListener('abort', onAbort);

        err ? reject(err) : resolve(addresses);
      });
    });
  }

  return await sendInParallel(addresses, port, request, signal);
}
