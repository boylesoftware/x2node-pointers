/**
 * JSON Pointer imlpementation module.
 *
 * @module x2node-pointers
 * @requires module:x2node-common
 * @requires module:x2node-records
 */
'use strict';

const RecordElementPointer = require('./lib/record-element-pointer.js');


// export the parser function
exports.parse = RecordElementPointer.parse;
