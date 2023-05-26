import Parser, { ParserOptions } from './stream-parser';

import { InfoMessageToken, ErrorMessageToken } from './token';

interface TokenData {
  number: number;
  state: number;
  class: number;
  message: string;
  serverName: string;
  procName: string;
  lineNumber: number;
}

function parseToken(parser: Parser, options: ParserOptions, callback: (data: TokenData) => void) {
  // length
  parser.readUInt16LE(() => {
    parser.readUInt32LE((number) => {
      parser.readUInt8((state) => {
        parser.readUInt8((clazz) => {
          parser.readUsVarChar((message) => {
            parser.readBVarChar((serverName) => {
              parser.readBVarChar((procName) => {
                (options.tdsVersion < '7_2' ? parser.readUInt16LE : parser.readUInt32LE).call(parser, (lineNumber: number) => {
                  callback({
                    'number': number,
                    'state': state,
                    'class': clazz,
                    'message': message,
                    'serverName': serverName,
                    'procName': procName,
                    'lineNumber': lineNumber
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

export function infoParser(parser: Parser, options: ParserOptions, callback: (token: InfoMessageToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new InfoMessageToken(data));
  });
}

export function errorParser(parser: Parser, options: ParserOptions, callback: (token: ErrorMessageToken) => void) {
  parseToken(parser, options, (data) => {
    callback(new ErrorMessageToken(data));
  });
}
