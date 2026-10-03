import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const LOCALES_DIR = path.resolve(__dirname, '../src/locales');
const BASE_FILE_NAME = 'en.json';
const BASE_FILE_PATH = path.join(LOCALES_DIR, BASE_FILE_NAME);

// ANSI Color Helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function main() {
  console.log(`${colors.bold}${colors.cyan}🔍 Better DeepSeek Locale Verification Tool${colors.reset}\n`);

  if (!fs.existsSync(BASE_FILE_PATH)) {
    console.error(`${colors.red}Error: Base locale file 'en.json' not found at ${BASE_FILE_PATH}${colors.reset}`);
    process.exit(1);
  }

  let baseLocale;
  try {
    baseLocale = JSON.parse(fs.readFileSync(BASE_FILE_PATH, 'utf8'));
  } catch (error) {
    console.error(`${colors.red}Error parsing base locale file 'en.json': ${error.message}${colors.reset}`);
    process.exit(1);
  }

  // Get all JSON files in the locales directory
  let files;
  try {
    files = fs.readdirSync(LOCALES_DIR).filter(file => file.endsWith('.json') && file !== BASE_FILE_NAME);
  } catch (error) {
    console.error(`${colors.red}Error reading locales directory: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(`${colors.yellow}No other locale files found to check in ${LOCALES_DIR}.${colors.reset}`);
    return;
  }

  let totalMissing = 0;
  let totalExtra = 0;

  files.forEach(file => {
    const filePath = path.join(LOCALES_DIR, file);
    let targetLocale;
    try {
      targetLocale = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.log(`${colors.red}❌ ${colors.bold}${file}${colors.reset}: Error parsing JSON: ${error.message}`);
      return;
    }

    const missingKeys = findMissingKeys(baseLocale, targetLocale);
    const extraKeys = findExtraKeys(baseLocale, targetLocale);

    totalMissing += missingKeys.length;
    totalExtra += extraKeys.length;

    const langCode = file.replace('.json', '');
    const langName = (targetLocale.messages && targetLocale.messages.language && targetLocale.messages.language[langCode]) || langCode.toUpperCase();

    console.log(`${colors.bold}${colors.cyan}➔ ${file}${colors.reset} ${colors.gray}(${langName})${colors.reset}`);

    if (missingKeys.length === 0 && extraKeys.length === 0) {
      console.log(`  ${colors.green}✓ All keys match the base locale perfectly!${colors.reset}`);
    } else {
      if (missingKeys.length > 0) {
        console.log(`  ${colors.red}⚠️  Missing Keys (${missingKeys.length}):${colors.reset}`);
        missingKeys.forEach(key => {
          console.log(`    ${colors.yellow}- ${key}${colors.reset}`);
        });
      }
      if (extraKeys.length > 0) {
        console.log(`  ${colors.cyan}ℹ️  Extra Keys (${extraKeys.length}) [Not in en.json]:${colors.reset}`);
        extraKeys.forEach(key => {
          console.log(`    ${colors.gray}- ${key}${colors.reset}`);
        });
      }
    }
    console.log(); // blank line
  });

  console.log(`${colors.bold}Summary:${colors.reset}`);
  if (totalMissing === 0) {
    console.log(`  ${colors.green}✓ Verification complete. No missing keys found across other languages!${colors.reset}`);
  } else {
    console.log(`  ${colors.red}❌ Verification complete. Found ${totalMissing} missing keys in total.${colors.reset}`);
  }
  if (totalExtra > 0) {
    console.log(`  ${colors.cyan}ℹ️  Found ${totalExtra} extra keys that can be safely removed from translation files.${colors.reset}`);
  }
}

function findMissingKeys(base, target, prefix = '') {
  let missing = [];
  for (const key in base) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (!(key in target)) {
      missing.push(currentPath);
    } else if (typeof base[key] === 'object' && base[key] !== null) {
      if (typeof target[key] !== 'object' || target[key] === null) {
        missing.push(currentPath);
      } else {
        missing = missing.concat(findMissingKeys(base[key], target[key], currentPath));
      }
    }
  }
  return missing;
}

function findExtraKeys(base, target, prefix = '') {
  let extra = [];
  for (const key in target) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (!(key in base)) {
      extra.push(currentPath);
    } else if (typeof target[key] === 'object' && target[key] !== null) {
      if (typeof base[key] !== 'object' || base[key] === null) {
        extra.push(currentPath);
      } else {
        extra = extra.concat(findExtraKeys(base[key], target[key], currentPath));
      }
    }
  }
  return extra;
}

main();
