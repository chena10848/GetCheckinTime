// s2.2.7.16

import Parser, { ParserOptions } from './stream-parser';

import { ReturnValueToken } from './token';

import metadataParse from '../metadata-parser';
import valueParse from '../value-parser';

function returnParser(parser: Parser, options: ParserOptions, callback: (token: ReturnValueToken) => void) {
  parser.readUInt16LE((paramOrdinal) => {
    parser.readBVarChar((paramName) => {
      if (paramName.charAt(0) === '@') {
        paramName = paramName.slice(1);
      }

      // status
      parser.readUInt8(() => {
        metadataParse(parser, options, (metadata) => {
          valueParse(parser, metadata, options, (value) => {
            callback(new ReturnValueToken({
              paramOrdinal: paramOrdinal,
              paramName: paramName,
              metadata: metadata,
              value: value
            }));
          });
        });
      });
    });
  });
}

export default returnParser;
module.exports = returnParser;
