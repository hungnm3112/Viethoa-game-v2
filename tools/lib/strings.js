const XML_ENTITY_TO_CHAR = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
};

const CHAR_TO_XML_ENTITY = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&apos;",
};

const PLACEHOLDER_PATTERN =
  /(\{[0-9A-Za-z_]+\}|%\d+\$[sdif]|%[0-9.]*[sdif]|%%|##|\\n|\\r|<[^>]+>|\[[A-Za-z0-9_:/.-]+\])/g;

export function decodeXml(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return XML_ENTITY_TO_CHAR[entity] ?? match;
  });
}

export function encodeXmlText(value) {
  return value.replace(/[&<>]/g, (char) => CHAR_TO_XML_ENTITY[char]);
}

export function encodeXmlAttribute(value, quote) {
  return value.replace(/[&<>"']/g, (char) => CHAR_TO_XML_ENTITY[char]);
}

export function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function looksTranslatable(value) {
  const text = normalizeText(decodeXml(value));
  if (text.length < 2 || text.length > 800) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^[A-Z0-9_./:-]+$/.test(text)) return false;
  if (/^[0-9.,:+\-*/% ()]+$/.test(text)) return false;
  if (/\.(xml|lua|dds|gfx|bmd|mp3|wav|png|jpg)$/i.test(text)) return false;
  if (/^[a-z0-9_./:-]+$/i.test(text) && !/\s/.test(text)) return false;
  return true;
}

export function extractXmlStrings(xml) {
  const results = new Map();

  for (const match of xml.matchAll(/<Data\b[^>]*>([^<]*)<\/Data>/gim)) {
    const decoded = decodeXml(match[1]);
    if (looksTranslatable(decoded)) {
      results.set(decoded, {
        value: decoded,
        kind: "data-node",
      });
    }
  }

  for (const match of xml.matchAll(/([A-Za-z_:.-]*(?:text|title|label|name|desc|description|summary|caption|hint|message)[A-Za-z_:.-]*)\s*=\s*(["'])(.*?)\2/gims)) {
    const decoded = decodeXml(match[3]);
    if (looksTranslatable(decoded)) {
      results.set(decoded, {
        value: decoded,
        kind: "attribute",
        attribute: match[1],
      });
    }
  }

  return [...results.values()];
}

export function replaceXmlStrings(xml, translations) {
  let output = xml.replace(/(<Data\b[^>]*>)([^<]*)(<\/Data>)/gim, (match, open, text, close) => {
    const decoded = decodeXml(text);
    const translated = translations.get(decoded);
    return translated ? `${open}${encodeXmlText(translated)}${close}` : match;
  });

  output = output.replace(/([A-Za-z_:.-]*(?:text|title|label|name|desc|description|summary|caption|hint|message)[A-Za-z_:.-]*)\s*=\s*(["'])(.*?)\2/gims, (match, name, quote, text) => {
    const decoded = decodeXml(text);
    const translated = translations.get(decoded);
    return translated ? `${name}=${quote}${encodeXmlAttribute(translated, quote)}${quote}` : match;
  });

  return output;
}

export function extractPlaceholders(value) {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[0]).sort();
}

export function placeholdersMatch(source, translated) {
  return JSON.stringify(extractPlaceholders(source)) === JSON.stringify(extractPlaceholders(translated));
}

export function groupForPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  if (normalized.includes("/languages/") || normalized.includes("ui") || normalized.includes("menu")) {
    return "ui";
  }
  if (normalized.includes("mission") || normalized.includes("scene") || normalized.includes("dialog") || normalized.includes("voice")) {
    return "dialog";
  }
  if (normalized.includes("items") || normalized.includes("rts") || normalized.includes("contentmanager")) {
    return "gameplay";
  }
  return "misc";
}
