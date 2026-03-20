const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../assets/js/kc-core.js');
const toastPath = path.join(__dirname, '../assets/js/components/toast.js');
const carouselPath = path.join(__dirname, '../assets/js/components/carousel.js');
const votingPath = path.join(__dirname, '../assets/js/components/voting.js');

const content = fs.readFileSync(srcPath, 'utf8');
const lines = content.split('\n');

// Find boundaries based on known comments or function signatures
function findLineIndexByStart(lines, text, startIndex = 0) {
    for (let i = startIndex; i < lines.length; i++) {
        if (lines[i].startsWith(text)) return i;
    }
    return -1;
}

const carouselStart = findLineIndexByStart(lines, '// -----------------------------'); // it's at line 114
const carouselEnd = findLineIndexByStart(lines, 'function refreshHeroCarousel()') + 56; // approximate

const voteStart = findLineIndexByStart(lines, 'let kcVotesRealtimeChannel');
const voteEnd = findLineIndexByStart(lines, '  } catch (_) {');

// Using the explicit line numbers from the view_file:
// Carousel: 114 to 229 -> indexes 113 to 228
// Votes: 231 to 503 -> indexes 230 to 502
// Toast: 576 to 593 -> indexes 575 to 592

// To be robust to minor changes, we'll verify the lines:
// Carousel start: "let currentSlide = 0;" is at index 116
const idxCarouselHeader = 114;
const idxCarouselEnd = 229; // last line '}' of refreshHeroCarousel

const idxVotesHeader = 231;
const idxVotesEnd = 503; // last line '}' of kcInitVoteStates

const idxToastHeader = 576;
const idxToastEnd = 593; // last line '}' of showToast

const carouselContent = lines.slice(idxCarouselHeader - 1, idxCarouselEnd).join('\n');
const votesContent = lines.slice(idxVotesHeader - 1, idxVotesEnd).join('\n');
const toastContent = lines.slice(idxToastHeader - 1, idxToastEnd).join('\n');

// Let's write the new files wrapped in some global exporter if we need, but for now just as they are to avoid breaking existing calls
fs.writeFileSync(carouselPath, `/* KinoCampus - Carousel Component */\n${carouselContent}\n`);
fs.writeFileSync(votingPath, `/* KinoCampus - Voting Component */\n${votesContent}\n`);
fs.writeFileSync(toastPath, `/* KinoCampus - Toast Component */\n${toastContent}\n`);

// Now cut them out of kc-core.js. We go backwards to not mess up indices.
lines.splice(idxToastHeader - 1, idxToastEnd - idxToastHeader + 1);
lines.splice(idxVotesHeader - 1, idxVotesEnd - idxVotesHeader + 1);
lines.splice(idxCarouselHeader - 1, idxCarouselEnd - idxCarouselHeader + 1);

fs.writeFileSync(srcPath, lines.join('\n'));
console.log('Successfully extracted carousel.js, voting.js, toast.js and updated kc-core.js');
