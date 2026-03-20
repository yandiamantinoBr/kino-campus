const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../assets/js/kc-utils.js');
const destPath = path.join(__dirname, '../assets/js/kc-constants.js');

const content = fs.readFileSync(srcPath, 'utf8');
const lines = content.split('\n');

// kc-utils.js defines constants from line 16 (index 15) to line 353 (index 352)
// Let's accurately parse where it starts and ends to be safe, or just slice by known metrics.
// From step 64: line 15 is "const MODULE_LABEL_MAP = Object.freeze({"
// line 353 is "]);"
const extractedLines = lines.slice(14, 353);
const extracted = extractedLines.join('\n');

const newConstantsFile = `/*
  KinoCampus - Global Constants
*/
(function (global) {
  'use strict';

${extracted}

  global.KC_CONSTANTS = Object.freeze({
    MODULE_LABEL_MAP,
    MODULE_ICON_MAP,
    CATEGORY_LABELS,
    SUBCATEGORY_LABELS,
    OPPORTUNITY_AREA_DEFINITIONS,
    HOUSING_REGION_DEFINITIONS,
    HOUSING_FEATURE_DEFINITIONS,
    LOST_FOUND_LOCATION_DEFINITIONS
  });
})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync(destPath, newConstantsFile);

const utilsHead = lines.slice(0, 14);
const injectedLine = `  const {
    MODULE_LABEL_MAP,
    MODULE_ICON_MAP,
    CATEGORY_LABELS,
    SUBCATEGORY_LABELS,
    OPPORTUNITY_AREA_DEFINITIONS,
    HOUSING_REGION_DEFINITIONS,
    HOUSING_FEATURE_DEFINITIONS,
    LOST_FOUND_LOCATION_DEFINITIONS
  } = window.KC_CONSTANTS;`;
const utilsTail = lines.slice(353);

const newUtilsFile = [...utilsHead, injectedLine, ...utilsTail].join('\n');
fs.writeFileSync(srcPath, newUtilsFile);

console.log('Constants successfully extracted to kc-constants.js and kc-utils.js updated.');
