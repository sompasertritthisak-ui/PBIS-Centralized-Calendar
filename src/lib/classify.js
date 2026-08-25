'use strict';
/* ==========================================================================
   FILING AN IMPORTED EVENT

   A Google calendar has no campus, year group or category field — only a
   title, a date and sometimes a location. These rules read the title and
   decide where the event belongs.

   The patterns are tuned to how PBIS actually writes its calendars, not to
   how a school might in principle: "Yr 5", "Y 11, 12, 13", "Year 7 - 10",
   "Yr 1 & Yr 2 PTC", "Toddler & Foundation", "SEC Pastoral Week".

   The rule that matters most is what happens when nothing matches: the event
   is left UNASSIGNED and surfaced for a human, never filed on a guess. A
   Nursery event quietly labelled Primary is worse than one plainly marked as
   needing attention.

   Shared by the CMS import screen and the command-line importer, so both file
   events identically.
   ========================================================================== */

/* ------------------------------------------------------------ year groups */

const CAMPUS_OF_YEAR = {
  nur: 'ey', rec: 'ey',
  y1: 'pr', y2: 'pr', y3: 'pr', y4: 'pr', y5: 'pr', y6: 'pr',
  y7: 'se', y8: 'se', y9: 'se', y10: 'se', y11: 'se', y12: 'se', y13: 'se'
};

/* Early Years is named in words rather than numbers. "Foundation" and
   "Toddler" are PBIS's own terms for the pre-Nursery groups. */
const EY_WORDS = [
  [/\bnursery\b/i, 'nur'],
  [/\breception\b/i, 'rec']
];
const EY_CAMPUS_WORDS = /\b(early\s*years?|\bEY\b|toddlers?|foundation|IEYC|pre-?school|kindergarten|EYFS)\b/i;
const PR_CAMPUS_WORDS = /\b(lower|upper)?\s*primary\b|\bIPC\b|\bKS[12]\b|\bkey stage\s*[12]\b/i;
const SE_CAMPUS_WORDS = /\b(secondary|\bSEC\b|IGCSE|A\s*Level|sixth form|KS[345]|key stage\s*[345])\b/i;

/**
 * Pull every year group named in a title.
 *
 * Handles the four forms PBIS uses, and only those — a looser pattern starts
 * matching stray digits like "Term 1" or "First 100 days":
 *   Yr 5 / Year 5 / Y5      a single group
 *   Year 7 - 10             an inclusive range
 *   Y 11, 12, 13            a list
 *   Yr 1 & Yr 2 / Yr 5 & 6  a pair, with or without a repeated prefix
 */
function yearGroupsIn(text) {
  const found = new Set();

  // A year token, then a run of numbers joined by range, list or "and".
  const RUN = /\b(?:years?|yrs?|y)\s*\.?\s*(\d{1,2}(?:\s*(?:[-–—]|to|&|,|and)\s*(?:(?:years?|yrs?|y)\s*\.?\s*)?\d{1,2})*)/gi;
  let m;
  while ((m = RUN.exec(text)) !== null) {
    const run = m[1];
    const nums = (run.match(/\d{1,2}/g) || []).map(Number).filter(n => n >= 1 && n <= 13);
    if (!nums.length) continue;
    // A dash or "to" between the first two numbers means an inclusive range.
    if (/\d\s*(?:[-–—]|to)\s*(?:(?:years?|yrs?|y)\s*\.?\s*)?\d/i.test(run) && nums.length >= 2) {
      const [a, b] = [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])];
      for (let n = a; n <= b; n++) found.add('y' + n);
      nums.slice(2).forEach(n => found.add('y' + n));
    } else {
      nums.forEach(n => found.add('y' + n));
    }
  }

  for (const [re, yg] of EY_WORDS) if (re.test(text)) found.add(yg);
  return [...found];
}

/* -------------------------------------------------------------- campus */

/* Titles that mean "everyone", so an unassigned campus is a deliberate
   whole-school reading rather than a failure to work it out. */
const WHOLE_SCHOOL = new RegExp([
  '\\b(whole school|all (students|staff|years|campus(es)?))\\b',
  '\\bschool clos(ed|ure)\\b',
  '\\bno children in school\\b',
  '\\b(public|national) holiday\\b',
  '\\b(mid[- ]?term|half[- ]?term|christmas|summer|easter)\\s*(break|holiday)\\b',
  '\\bterm\\s*\\d*\\s*(start|begin|end)s?\\b',
  '\\b(first|last)\\s+day\\b',
  '\\bfirst day back\\b',
  '\\bwelcome back\\b',
  '\\b(staff\\s*)?(pd|inset)\\s*day\\b',
  '\\bpi mai\\b', '\\bthat ?luang\\b', '\\blunar new year\\b', '\\bboat racing\\b',
  '\\beid\\b', '\\bdiwali\\b', '\\bmid autumn\\b'
].join('|'), 'i');

/* -------------------------------------------------------------- category */

/* Ordered — the first match wins, so the specific patterns come first.
   "Day" and "Week" are far too common at PBIS to be category signals on
   their own, which is why they never appear alone here. */
const CATEGORY_RULES = [
  // Parent-facing meetings. PTC is PBIS's abbreviation for parent-teacher
  // conference and is by far the most common one in these calendars.
  [/\bPTC\b|parents?[’']?\s*(evening|consultation|consult|meeting|conference)|parent consult|coffee morning|settling in meetings/i, 'parent'],

  [/\bassembly\b|assemblies/i, 'assembly'],

  // Reporting cycle: open, close, due, tidy, sent to parents.
  [/\breports?\b|\bgrading\b|\bintroduce reports\b/i, 'assessment'],

  [/\bmock\b|\bexams?\b|\bIGCSE\b|\bCAT testing\b|online assessments?/i, 'exam'],

  // Fixtures and meets, including the many external invitationals.
  [/triathlon|swimming|swim meet|football|athletic|sports\s*(day|week)|invitational|tournament|fixture|\bPE week\b|\bmatch\b/i, 'sports'],

  // Academic competitions: Olympiads, maths challenges, code breaking.
  [/olympiad|mathematics challenge|maths? (competition|challenge)|\bSASMO\b|\bAMO\b|\bISMO\b|\bSMC\b|\bFOBISS?[EI]A\b|code breaking|competition/i, 'academic'],

  [/\btrips?\b|residential|excursion|work experience|\bto (Nam Plien|Funderland|VV)\b|field ?work/i, 'trip'],

  [/graduation|gradration|leavers|prize giving/i, 'graduation'],

  [/\bholidays?\b|\bbreak\b|clos(ed|ure)|no children in school/i, 'holiday'],

  [/staff (pd|development|training)|\bPD day\b|\bINSET\b|induction|\bSLT\b|middle leader|new staff/i, 'staff'],

  [/celebration|festival|\bshow\b|\bnight\b|wonderland|carol|fun day|international day|exhibition|photo day|\bfair\b|book (day|week)|dress rehearsal|party/i, 'celebration'],

  [/\bdeadline\b|\bdue\b|closes?\b|\bcut-?off\b/i, 'deadline'],

  [/\bmeeting\b|\bbriefing\b|\bcouncil\b|\belection\b/i, 'meeting'],

  [/\bclub\b|\bECA\b|after ?school|activit(y|ies)/i, 'eca'],

  [/open day|admissions?|entrance|new families|new fams|orientation|tour/i, 'admissions'],

  [/\bweek\b/i, 'academic']   // themed weeks: Language, Humanities, STEM, Book
];

/**
 * Decide campus, category and year groups for one imported event.
 *
 * @param ev      the parsed event ({ title, description })
 * @param source  'se' when the file is the Secondary calendar (campus is then
 *                known and nothing is guessed), otherwise 'pr-ey'
 * @param taxo    the taxonomy, used to reject ids this school does not have
 */
function classify(ev, source, taxo) {
  const text = `${ev.title || ''} ${ev.description || ''}`;
  const catIds = new Set(taxo.categories.map(c => c.id));
  const ygIds = new Set(taxo.yearGroups.map(y => y.id));

  const yearGroupIds = yearGroupsIn(text).filter(y => ygIds.has(y));
  const wholeSchool = WHOLE_SCHOOL.test(text);

  let campusId = null, why = '';

  if (source === 'se') {
    campusId = 'se';
    why = 'from the Secondary calendar';
  } else if (wholeSchool) {
    why = 'reads as whole-school';
  } else if (yearGroupIds.length) {
    const campuses = [...new Set(yearGroupIds.map(y => CAMPUS_OF_YEAR[y]))];
    if (campuses.length === 1) { campusId = campuses[0]; why = `year group ${yearGroupIds.join(', ')}`; }
    else why = 'spans more than one campus';
  } else if (EY_CAMPUS_WORDS.test(text) && PR_CAMPUS_WORDS.test(text)) {
    why = 'named for both Early Years and Primary';
  } else if (EY_CAMPUS_WORDS.test(text)) {
    campusId = 'ey'; why = 'named for Early Years';
  } else if (PR_CAMPUS_WORDS.test(text)) {
    campusId = 'pr'; why = 'named for Primary';
  } else if (SE_CAMPUS_WORDS.test(text)) {
    campusId = 'se'; why = 'named for Secondary';
  }

  const hit = CATEGORY_RULES.find(([re]) => re.test(text));
  let categoryId = hit ? hit[1] : 'other';
  if (!catIds.has(categoryId)) categoryId = 'other';

  // A staff development day or a school closure is not a campus event: it
  // applies to the whole school regardless of which calendar it was typed
  // into. Treating these as unplaceable would bury the genuinely ambiguous
  // ones in a review list nobody then reads.
  if (!campusId && !why && (categoryId === 'staff' || categoryId === 'holiday')) {
    why = `${categoryId === 'staff' ? 'a staff' : 'a closure'} date — school-wide`;
  }

  return {
    campusId,
    categoryId,
    yearGroupIds,
    // Only the combined calendar can fail to place an event, and only when
    // nothing at all in the title says who it is for.
    needsReview: source !== 'se' && !campusId && !wholeSchool && !why,
    why
  };
}

module.exports = {
  classify, yearGroupsIn,
  CATEGORY_RULES, CAMPUS_OF_YEAR, WHOLE_SCHOOL,
  EY_CAMPUS_WORDS, PR_CAMPUS_WORDS, SE_CAMPUS_WORDS
};
