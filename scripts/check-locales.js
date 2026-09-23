/* global URL, console, process */
import { readFileSync } from 'node:fs';
import { IntlMessageFormat } from 'intl-messageformat';
import { languages } from '../src/client/locales/registry.js';

const catalogs = Object.fromEntries(Object.keys(languages).map(language => [
  language, JSON.parse(readFileSync(new URL(`../src/client/locales/${language}.json`, import.meta.url), 'utf8')),
]));
const sourceKeys = Object.keys(catalogs.en).sort();
const errors = [];
function inspect(nodes, parameters = new Set(), plurals = []) {
  for (const node of nodes) {
    if (node.value && typeof node.value === 'string' && node.type !== 0) parameters.add(node.value);
    if (node.type === 6) plurals.push(Object.keys(node.options));
    if (node.options) Object.values(node.options).forEach(option => inspect(option.value, parameters, plurals));
    if (node.children) inspect(node.children, parameters, plurals);
  }
  return { parameters: [...parameters].sort(), plurals };
}
for (const [language, catalog] of Object.entries(catalogs)) {
  const keys = Object.keys(catalog).sort();
  for (const key of sourceKeys.filter(key => !Object.hasOwn(catalog, key))) errors.push(`${language}: missing ${key}`);
  for (const key of keys.filter(key => !Object.hasOwn(catalogs.en, key))) errors.push(`${language}: obsolete ${key}`);
  for (const key of sourceKeys.filter(key => Object.hasOwn(catalog, key))) {
    const message = catalog[key];
    if (typeof message !== 'string' || !message.trim()) { errors.push(`${language}: empty ${key}`); continue; }
    try {
      const actual = inspect(new IntlMessageFormat(message, language, undefined, { ignoreTag: true }).getAst());
      const expected = inspect(new IntlMessageFormat(catalogs.en[key], 'en', undefined, { ignoreTag: true }).getAst());
      if (actual.parameters.join(',') !== expected.parameters.join(',')) errors.push(`${language}: parameters differ for ${key}`);
      if (actual.plurals.length !== expected.plurals.length) errors.push(`${language}: plural structure differs for ${key}`);
      for (const options of actual.plurals) {
        const required = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
        for (const category of required) if (!options.includes(category)) errors.push(`${language}: ${key} needs plural ${category}`);
      }
    } catch (error) { errors.push(`${language}: invalid ${key}: ${error.message}`); }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Validated ${sourceKeys.length} messages in ${Object.keys(catalogs).length} languages.`);
