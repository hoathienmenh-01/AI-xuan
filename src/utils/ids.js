'use strict';

const { customAlphabet } = require('nanoid');

// URL-safe, no lookalikes.
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
const short = customAlphabet(alphabet, 10);

function newId(prefix) {
  return `${prefix}_${short()}`;
}

module.exports = { newId };
