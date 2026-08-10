'use strict';

const { TextDecoder, TextEncoder } = require('node:util');
const {
  ReadableStream,
  TransformStream,
  WritableStream,
} = require('node:stream/web');
const { MessageChannel, MessagePort } = require('node:worker_threads');

// jest-environment-jsdom does not expose these Node globals, while Undici and
// the production Node 24 runtime do. Fill only missing values before modules
// are evaluated so transport tests exercise the real dependency.
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.ReadableStream === 'undefined') global.ReadableStream = ReadableStream;
if (typeof global.TransformStream === 'undefined') global.TransformStream = TransformStream;
if (typeof global.WritableStream === 'undefined') global.WritableStream = WritableStream;
if (typeof global.MessageChannel === 'undefined') global.MessageChannel = MessageChannel;
if (typeof global.MessagePort === 'undefined') global.MessagePort = MessagePort;
