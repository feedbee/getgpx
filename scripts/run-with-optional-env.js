import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

if (existsSync('.env')) process.loadEnvFile('.env');

await import(pathToFileURL(resolve(process.argv[2])).href);
