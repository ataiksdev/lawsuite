// ============================================================================
// Lawmate - Guided Tour Steps
// One stop per core workflow, in dependency order: a matter needs a client,
// a task needs a matter, and so on. The tour navigates the app for the user —
// each step just needs a route and (optionally) an element to point at.
// ============================================================================

export interface TourStep {
  id: string;
  route: string;
  /** CSS selector for the element to highlight. Omit for a centered, non-targeted step. */
  selector?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/',
    title: 'Welcome to Lawmate',
    body: "Here's a quick tour of how everything fits together — starting with the one thing every matter depends on: a client.",
  },
  {
    id: 'clients',
    route: '/clients',
    selector: '[data-tour="new-client-btn"]',
    title: 'Start with a client',
    body: 'Clients come first — individuals or companies you represent. Every matter you open needs one, so this is always your starting point.',
  },
  {
    id: 'matters',
    route: '/matters',
    selector: '[data-tour="new-matter-btn"]',
    title: 'Open a matter',
    body: "Once a client exists, create a matter for their case — litigation, advisory, drafting, whatever it is. Matters are where tasks, documents, notes, and deadlines all attach.",
  },
  {
    id: 'tasks',
    route: '/tasks',
    selector: '[data-tour="new-task-btn"]',
    title: 'Track work on the board',
    body: 'Break a matter into tasks and manage them here on the Kanban board. Drag a card between To Do, In Progress, and Done to update its status.',
  },
  {
    id: 'documents',
    route: '/documents',
    selector: '[data-tour="documents-tabs"]',
    title: 'Keep documents organized',
    body: "This view aggregates every document across your matters. To add one, open the matter it belongs to — that keeps filings, contracts, and correspondence attached to the right case.",
  },
  {
    id: 'calendar',
    route: '/calendar',
    selector: '[data-tour="new-event-btn"]',
    title: "Don't miss a deadline",
    body: 'Log court dates, filing deadlines, and meetings here so nothing slips. Events can be linked to a specific matter.',
  },
  {
    id: 'notes',
    route: '/notes',
    selector: '[data-tour="new-note-btn"]',
    title: 'Capture notes as you go',
    body: 'Typed or handwritten, notes can stand alone or link to a matter or calendar event — handy for client calls or hearing recaps.',
  },
  {
    id: 'reports',
    route: '/reports',
    selector: '[data-tour="generate-report-btn"]',
    title: 'Report on firm activity',
    body: "Generate a weekly or monthly summary across every matter and client — useful for partner updates or your own billing review.",
  },
  {
    id: 'finish',
    route: '/',
    title: "That's the loop",
    body: "Client → Matter → Task/Document/Calendar/Note → Report. You can replay this tour anytime from the help icon in the header.",
  },
];
