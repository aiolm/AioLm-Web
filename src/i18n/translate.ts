import type { MessageCatalog, Translator } from './types';
/** Interpolation returns text; React remains responsible for HTML escaping. */
export function createTranslator(messages: MessageCatalog): Translator {
  return (key, values) => {
    const message = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
    return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, name: string) =>
      values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
  };
}
