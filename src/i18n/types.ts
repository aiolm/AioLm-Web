export type MessageCatalog = Record<string, string>;
export type Translator = (key: string, values?: Record<string, string | number>) => string;
