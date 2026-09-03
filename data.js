// ============================================================
// Badge Tracker — master data
// Official Girlguiding Guides badge set (2026), theme colours,
// and the status model. This file rarely needs editing —
// "Extra" badges and members live in the Sheet, not here.
// ============================================================

const THEMES = [
  { id: 'know',    name: 'Know Myself',        color: '#3E7CB1', tint: '#EAF2F8', skills: ['Reflect', 'Network'] },
  { id: 'express', name: 'Express Myself',      color: '#D6266E', tint: '#FBEAF1', skills: ['Innovate', 'Communicate'] },
  { id: 'well',    name: 'Be Well',             color: '#8E5BA6', tint: '#F2EBF5', skills: ['Feel Good', 'First Aid'] },
  { id: 'adventures', name: 'Have Adventures',  color: '#3D9A5C', tint: '#EAF5EE', skills: ['Camp', 'Explore'] },
  { id: 'action',  name: 'Take Action',         color: '#E08A1E', tint: '#FCF1E1', skills: ['Make Change', 'Influence'] },
  { id: 'future',  name: 'Skills for My Future', color: '#E48CAE', tint: '#FCEEF3', skills: ['Lead', 'Live Smart'] },
];

const SKILL_LEVELS = [3, 4, 5];

const INTEREST_BADGES = {
  know: ['Personal Brand', 'Aspirations', 'Guiding History', 'Human Rights', 'Historian', 'Bookworm', 'Personal Best', 'Food Critic'],
  express: ['Photography', 'Vlogging', 'Confectionery', 'Media Critic', 'Entertainer', 'Music', 'Artist', 'Stitcher'],
  well: ['Fitness', 'Meditation', 'Natural Remedies', 'Mixology', 'Friendship', 'Healthy Sleep', 'Journalling', 'Athlete'],
  adventures: ['Whittling', 'Backwoods Cooking', 'Geocaching', 'Navigator', 'Day Tripper', 'Overnight', 'Pioneering', 'Entomology'],
  action: ['Be Prepared', 'Campaigning', 'Conscious Consumer', 'Craftivism', 'Thrift', 'Biodiversity', 'Clean Planet', 'My Views'],
  future: ['Saver', 'Upcycling', 'Fixing', 'Investigating', 'Engineering', 'Codebreaking', 'Happy Habits', 'Interior Designer'],
};

const TOP_AWARDS = ['Bronze', 'Silver', 'Gold'];

// Extra badges are grouped into 3 subcategories, mainly for the
// collapsible Inventory panels. Bronze/Silver/Gold (type 'award') are
// shown alongside the 'awards-promise' group in Inventory specifically,
// even though they're a different badge type everywhere else.
const EXTRA_CATEGORIES = [
  { id: 'birthday', name: 'Birthday', color: '#4FA8D8' },
  { id: 'awards-promise', name: 'Awards & Promise', color: '#D4A017' },
  { id: 'non-program', name: 'Non-Program', color: '#6B7280' },
];

const DEFAULT_EXTRA_BADGES_BY_CATEGORY = {
  birthday: ['11th Birthday'],
  'awards-promise': ['Guide Promise', 'Gold (pin)'],
  'non-program': ['Camp as Leader', 'Camp as Guide'],
};

const DEFAULT_EXTRA_BADGES = Object.values(DEFAULT_EXTRA_BADGES_BY_CATEGORY).flat();

function defaultCategoryForExtra(name) {
  for (const cat of Object.keys(DEFAULT_EXTRA_BADGES_BY_CATEGORY)) {
    if (DEFAULT_EXTRA_BADGES_BY_CATEGORY[cat].includes(name)) return cat;
  }
  return 'non-program'; // fallback for older custom extras with no assigned category
}

function extraCategoryById(id) {
  return EXTRA_CATEGORIES.find(c => c.id === id);
}

// Statuses set before this moment are shown as "Imported" rather than a
// date, since they came from the original spreadsheet import (or testing
// during the build) rather than a real day-to-day update.
const IMPORT_CUTOFF = '2026-09-03T18:10:00.000Z';

// Status model — order matters (used for sorting rosters)
const STATUSES = ['has', 'owed', 'unconfirmed', 'partial', 'not_gained'];

const STATUS_META = {
  has:         { label: 'Gained',      color: '#3D9A5C', bg: '#EAF5EE' },
  owed:        { label: 'Owed',        color: '#C0392B', bg: '#FBEAEA' },
  unconfirmed: { label: 'Unconfirmed', color: '#B8860B', bg: '#FBF3DF' },
  partial:     { label: 'Partial',     color: '#3E7CB1', bg: '#EAF2F8' },
  not_gained:  { label: 'Not Gained',  color: '#9AA0AA', bg: '#F1F1F0' },
};

// ------------------------------------------------------------
// Build the full master badge list from the tables above.
// Each badge: { id, type, theme, name, track, level, subcategory }
// type: 'interest' | 'skill' | 'theme' | 'award' | 'extra'
// ------------------------------------------------------------
function buildMasterBadgeList(extraBadgeNames, extraBadgeCategories) {
  const badges = [];

  THEMES.forEach(theme => {
    // Interest badges
    INTEREST_BADGES[theme.id].forEach(name => {
      badges.push({
        id: `interest_${theme.id}_${slug(name)}`,
        type: 'interest',
        theme: theme.id,
        name,
      });
    });

    // Skill badges — 2 tracks x 3 levels
    theme.skills.forEach(track => {
      SKILL_LEVELS.forEach(level => {
        badges.push({
          id: `skill_${theme.id}_${slug(track)}_${level}`,
          type: 'skill',
          theme: theme.id,
          name: `${track} ${level}`,
          track,
          level,
        });
      });
    });

    // Theme award
    badges.push({
      id: `theme_${theme.id}`,
      type: 'theme',
      theme: theme.id,
      name: theme.name,
    });
  });

  // Top awards
  TOP_AWARDS.forEach(name => {
    badges.push({ id: `award_${slug(name)}`, type: 'award', theme: null, name });
  });

  // Extra badges (starter list + any custom ones already saved)
  const catMap = extraBadgeCategories || {};
  (extraBadgeNames || DEFAULT_EXTRA_BADGES).forEach(name => {
    badges.push({
      id: `extra_${slug(name)}`,
      type: 'extra',
      theme: null,
      name,
      subcategory: catMap[name] || defaultCategoryForExtra(name),
    });
  });

  return badges;
}

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function themeById(id) {
  return THEMES.find(t => t.id === id);
}
