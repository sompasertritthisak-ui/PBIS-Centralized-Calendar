'use strict';
/* ==========================================================================
   Authorisation rules. These live in one place because the same decision has
   to hold for the API, the ICS feeds, the embed and the server-rendered event
   pages — a leak in any one of them is a leak.
   ========================================================================== */

const RANK = { public: 0, parent: 20, student: 20, teacher: 40, campusadmin: 60, caladmin: 80, super: 100 };

const PERMISSIONS = {
  // 'view' is the public read right and is deliberately granted to everyone —
  // it must never be used to gate an administrative route. CMS access is
  // 'accessCms', which no unauthenticated caller can hold.
  view:            ['super','caladmin','campusadmin','teacher','parent','student','public'],
  accessCms:       ['super','caladmin','campusadmin'],
  submit:          ['super','caladmin','campusadmin','teacher'],
  create:          ['super','caladmin','campusadmin'],
  edit:            ['super','caladmin','campusadmin'],
  publish:         ['super','caladmin','campusadmin'],
  approve:         ['super','caladmin'],
  import:          ['super','caladmin'],
  manageTaxonomy:  ['super','caladmin'],
  manageUsers:     ['super'],
  viewAudit:       ['super','caladmin'],
  rollover:        ['super','caladmin'],
  manageApiKeys:   ['super']
};

const can = (role, action) => (PERMISSIONS[action] || []).includes(role);

/** Statuses a role may ever see. */
function visibleStatuses(role) {
  if (role === 'super' || role === 'caladmin') return null;               // all
  if (role === 'campusadmin') return ['draft','pending','published','cancelled','postponed','completed'];
  return ['published','cancelled','postponed','completed'];
}

/** Visibility levels a role may ever see. */
function visibleLevels(role) {
  if (['super','caladmin','campusadmin'].includes(role)) return ['public','internal','restricted'];
  if (['teacher','student','parent'].includes(role)) return ['public','internal'];
  return ['public'];
}

/**
 * SQL fragment restricting an events query to what this viewer may see.
 * Returned as {sql, params} so it can be composed into any query — the API,
 * the feed builder and the page renderer all use this same clause.
 */
function eventScopeSql(viewer, alias = 'e') {
  const role = (viewer && viewer.role) || 'public';
  const clauses = [`${alias}.deleted_at IS NULL`];
  const params = [];

  const levels = visibleLevels(role);
  clauses.push(`${alias}.visibility IN (${levels.map(() => '?').join(',')})`);
  params.push(...levels);

  const statuses = visibleStatuses(role);
  if (statuses) {
    clauses.push(`${alias}.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }

  // A campus admin sees their own campus plus whole-school events.
  if (role === 'campusadmin' && viewer.campus_id) {
    clauses.push(`(${alias}.campus_id = ? OR ${alias}.campus_id IS NULL)`);
    params.push(viewer.campus_id);
  }
  return { sql: clauses.join(' AND '), params };
}

/** Can this viewer modify this specific event? */
function canEditEvent(viewer, event) {
  if (!viewer || !can(viewer.role, 'edit')) return false;
  if (viewer.role === 'campusadmin') {
    if (event.campus_id && event.campus_id !== viewer.campus_id) return false;
    if (!event.campus_id) return false;   // whole-school events belong to calendar admins
  }
  return true;
}

/** Audiences a viewer role should be shown by default (§15, inclusive by relationship). */
const AUDIENCE_ACCEPT = {
  parents:    ['parents','students','community'],
  students:   ['students','community'],
  teachers:   ['teachers','staff','leadership','students','community'],
  staff:      ['staff','teachers','leadership','community'],
  leadership: ['leadership','staff','teachers','parents','students','community']
};

module.exports = {
  RANK, PERMISSIONS, can, visibleStatuses, visibleLevels,
  eventScopeSql, canEditEvent, AUDIENCE_ACCEPT
};
