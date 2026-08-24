FreeChessCoach UI/UX Design Guide
1. Product understanding

FreeChessCoach is a personalized chess-improvement application with four main workflows:

Games

Analyze a game
Play against the coach
Continue unfinished sessions
Start coaching sessions for imported games
Delete games

Coaching session

Review moves on an interactive board
See engine evaluation and move quality
Explore alternative moves
Receive contextual AI coaching
Reply to the coach
Optionally hear coaching via text-to-speech

Progress

Identify recurring weaknesses such as calculation depth
Connect observations to evidence from past sessions
Review session summaries
Compare recent performance
Receive practice assignments

Settings

Edit profile and playing level
Select a coach personality
Configure coach voice

The strongest differentiator is not game analysis alone. It is:

A persistent AI chess coach that remembers recurring weaknesses, connects lessons across games, and turns analysis into an improvement plan.

The redesigned interface should make this value immediately obvious.

2. Main problems
Overall visual system

The application works, but much of the interface resembles browser-default HTML rather than a deliberate product system.

Problems
Weak distinction between headings, supporting text, controls, and content
Inconsistent corner radii
Inconsistent spacing within and between sections
Native-looking buttons, radios, checkboxes, and select-like controls
Borders are used heavily without enough elevation or contrast hierarchy
Icons mix chess symbols, emoji, letters, punctuation, and UI icons
Green is applied to navigation, primary actions, statuses, tabs, charts, and evaluation states without distinct semantic roles
Large areas appear unfinished rather than intentionally spacious
Desktop content is sometimes too wide for comfortable reading
Mobile uses desktop content structures with clipping rather than purpose-built responsive layouts
3. Screen-by-screen analysis
Desktop: Game session

This is the most important and most complex screen.

What works
The chessboard is centrally positioned.
Moves, board, and coach are available simultaneously.
Evaluation history and game report add useful analytical depth.
AI coaching is connected to a specific move.
Problems
Three columns compete equally for attention.
The left sidebar contains navigation, moves, notes, and report information in a narrow space.
Move symbols and colored indicators are not self-explanatory.
Playback buttons are visually small and inconsistent.
The board has plenty of unused surrounding space but still feels crowded by adjacent panels.
Evaluation bar labels are extremely small.
The chart is separated far below the board, weakening the connection to the selected move.
Coach messages look like large beige text boxes instead of a conversation or lesson.
“Debug last answer” is visible in the production interface.
“Autoplay coach voice” uses a browser-default checkbox.
The composer does not clearly indicate what users can ask.
The selected move, board position, coach message, and chart event do not form one strong visual state.
Recommended structure

Use a professional three-panel workspace:

Left panel: 280–320 px
Move list
Compact playback toolbar
Collapsible notes
Center: flexible, minimum 620 px
Board
Evaluation bar
Compact timeline directly below the board
Exploration controls
Right panel: 360–420 px
Coach conversation
Lesson context
Composer fixed inside the panel

Allow left and right panels to collapse. Preserve the widest possible board.

The selected move must be represented consistently across:

Move list
Board
Evaluation bar
Timeline
Coach lesson

Use the same accent color and selected-state treatment in all five places.

Desktop: Settings
Problems
The page is extremely wide while the meaningful content occupies a small portion.
Coach options appear as a raw radio list.
Emoji create an inconsistent visual language.
“Male, 40s” and similar details dominate names without clearly explaining their relevance.
Selection is indicated only by a small radio button.
Voice settings lack hierarchy and preview interactions.
There is no clear save behavior.
Profile, coach, and voice settings carry equal visual weight.
Recommended redesign

Set a maximum content width of 960 px.

Use either a two-column settings shell or a short settings navigation:

Profile
Coach
Voice
Preferences

Represent coaches as selectable cards:

Consistent portrait or abstract avatar
Coach name
One-line personality description
Coaching style tags
“Preview voice” button
Strong selected state
Optional “Recommended for your level” label

Avoid emoji as permanent product icons. Use one consistent icon family.

Add a sticky save bar only when changes exist:

“Discard”
“Save changes”
Desktop: Games
Problems
“Analyze a game” and “Play the coach” occupy excessive vertical space.
The game rows have little information hierarchy.
Status labels are written as actions: “ready — start session.”
Game name, source, result, date, rating, and coaching status are not consistently structured.
Delete buttons are repeated prominently on every row.
The oversized layout still communicates relatively little.
Player-name truncation and scanning behavior will become worse as the list grows.
Recommended redesign

Start with a compact page header:

Games
 “Review your games and continue coaching sessions.”

Header actions:

Primary: Analyze game
Secondary: Play coach

Each game row/card should contain:

Player names
Result
Opponent/source icon
Date
Time control or rating
Coaching status
Primary contextual action
Overflow menu for Delete

Example:

Dany_Abr vs Sven                       1–0
Aug 23, 2026 · Rapid · Imported
Ready for coaching              [Start session] [•••]


Status and action should be separate:

Status: Not reviewed, In progress, Completed
Action: Start session, Continue, Review

Provide filters when needed:

All
Ready
In progress
Completed

Add search only once the list size justifies it.

Desktop: Progress

This screen contains valuable information but currently resembles an internal report.

Problems
The left column contains long prose without summaries or visual cues.
Category arrows have unclear behavior.
“Pieces of evidence” is useful but visually secondary.
The chart labels are rotated, clipped, and practically unreadable.
The meaning of chart values is unclear.
Recent-session summaries are text-heavy.
Practice assignments are visually buried inside paragraphs.
The page lacks an at-a-glance improvement story.
Recommended hierarchy

Begin with a progress summary:

Your focus this week
Calculation discipline

Improving: Opening planning
Needs attention: Forcing-reply scan
Practice target: 10 tactical positions


Follow with three sections:

Focus areas
Trend
Recent lessons

Each focus-area card should show:

Category
Trend: improving, stable, or needs attention
Short summary, maximum 2–3 lines
Evidence count
“View evidence”

Do not display a bar chart with long vertical labels. Use one of:

Horizontal bars
Compact trend lines
Ranked focus-area list with change indicators

Make assignments first-class components:

Practice assignment
Complete 10 tactical positions

Before choosing a move, name:
• Opponent checks
• Opponent captures
• King-square threats

[Start practice]  [Mark complete]

4. Mobile-specific redesign
Session navigation

The Board / Coach segmented control is the correct responsive pattern. Keep it, but make the session shell more cohesive.

Recommended mobile order:

Compact session header
Board/Coach segmented control
Active content
Context-specific controls
Global navigation

During a session, consider hiding the standard global bottom navigation or replacing it with a compact “Exit session” action. The current bottom navigation wastes height and competes with the session.

Mobile board
Problems
The evaluation bar crowds the board.
Coordinates and evaluation labels are very small.
Move history is clipped into one difficult horizontal strip.
The selected move is oversized relative to neighboring moves.
“Explore on your own” resembles an empty form field.
Large unused space appears below the controls.
Recommendations
Keep the board edge-to-edge with 8–12 px page padding.
Use an optional collapsible evaluation bar.
Place current evaluation above the board as a compact value if width is constrained.
Replace the clipped move strip with a horizontally scrolling move timeline that snaps selected moves into view.
Add explicit playback controls:
[First] [Previous]   9. Ne5   [Next] [Last]

Make exploration an action:
[Explore this position]


When exploration begins, display a clear mode banner:

Exploration mode
Try moves freely. The game history will not change.
[Exit]

Mobile coach
Problems
Messages are visually anonymous.
Lesson explanations and questions use almost the same presentation.
Audio playback is represented by a tiny triangle in the text.
The move divider resembles a browser control.
Composer and bottom navigation create stacked fixed bars.
Large blank space makes the conversation feel incomplete.
Recommendations

Use structured coaching cards:

Coach avatar
Coach name or “Your coach”
Message content
Audio button
Related move
Optional lesson label

Differentiate content:

Observation
Question
Hint
Key lesson
Practice task

Example:

KEY LESSON · MOVE 9

Before playing Ne5, check Black’s queen on d5.

Which white piece was already under attack, and what
capture became available after the knight moved?

[Play audio]  [Show on board]


Composer:

Ask about this position…                     [Send]


Support suggested replies where useful:

“Show the threat”
“Give me a hint”
“Explain Ne5”
Mobile games
Problems
Player names are heavily truncated.
Status/action pills consume most of each row’s width.
Delete remains prominent.
Result, date, and source disappear.
Rows prioritize controls over game identity.
The page has no compact descriptive header.
Recommendations

Use stacked cards rather than compressed table rows:

Dany_Abr vs Sven                         1–0
Aug 23 · Rapid

In progress                         [Continue]
                                      [•••]


Move Delete into the overflow menu and require confirmation.

Keep the two top actions, but reduce their height. “Analyze a game” should remain primary; “Play coach” should become a standard secondary button.

Mobile progress

This is the most visibly broken responsive screen.

Problems
Content overflows horizontally and is clipped at the right edge.
Long paragraphs do not adapt to the viewport.
The chart retains a desktop structure and becomes unreadable.
The page begins without a visible title or summary.
Cards appear nested inside a wide desktop container.
A vertical chart label is cut off.
Bottom navigation overlays content.
Recommendations
Enforce max-width: 100% for all panels and children.
Ensure grid/flex children use min-width: 0.
Remove all desktop fixed widths on mobile.
Replace the chart with horizontal ranked bars.
Clamp each focus-area summary to three lines with “Read more.”
Present one card per row with 16 px outer padding.
Add bottom padding equal to navigation height plus safe-area inset.
Put the weekly focus and practice assignment above historical evidence.
5. Design system
Brand direction

Aim for:

Calm, intelligent, focused, encouraging, and analytical.

Avoid a generic admin-dashboard appearance. The visual language should combine the seriousness of a chess study tool with the approachability of a personal coach.

Color tokens
--color-bg: #F7F8F5;
--color-surface: #FFFFFF;
--color-surface-subtle: #F1F3EE;
--color-border: #DDE2DA;
--color-border-strong: #C8D0C5;

--color-text: #17201A;
--color-text-secondary: #556159;
--color-text-muted: #778079;

--color-primary: #2F6B45;
--color-primary-hover: #275A3B;
--color-primary-soft: #E7F1E9;
--color-on-primary: #FFFFFF;

--color-info: #3267A8;
--color-info-soft: #EAF2FC;
--color-warning: #A86613;
--color-warning-soft: #FFF3DD;
--color-danger: #B5472E;
--color-danger-soft: #FCEBE7;
--color-success: #2F7A4B;


Do not use primary green for every state. Reserve green for primary actions, selection, and positive progress.

Typography

Use Inter, Source Sans 3, or another neutral UI sans-serif.

--font-size-xs: 12px;
--font-size-sm: 14px;
--font-size-md: 16px;
--font-size-lg: 18px;
--font-size-xl: 24px;
--font-size-2xl: 32px;

--line-height-tight: 1.25;
--line-height-normal: 1.5;
--line-height-reading: 1.65;


Rules:

Default body text: 16 px
Supporting interface text: 14 px
Never use text below 12 px
Long coaching and progress text: maximum 65–72 characters per line
Use weights 400, 500, 600, and 700 only
Spacing

Use a strict 4 px base scale:

4, 8, 12, 16, 20, 24, 32, 40, 48, 64


Standard values:

Mobile page padding: 16 px
Desktop page padding: 32 px
Card padding: 20–24 px desktop, 16 px mobile
Section gap: 24–32 px
Form control gap: 12–16 px
Radius and elevation
Small controls: 8 px
Buttons and inputs: 10 px
Cards: 12 px
Large panels: 16 px
Pills: 999 px


Use shadows sparingly:

box-shadow: 0 1px 2px rgba(20, 30, 23, 0.05),
            0 4px 12px rgba(20, 30, 23, 0.04);


Use either a border or meaningful shadow—not both heavily.

6. Component rules
Buttons

Variants:

Primary
Secondary
Tertiary/ghost
Destructive
Icon-only

Minimum sizes:

Desktop: 40 px high
Mobile: 44–48 px high
Icon-only touch target: 44 × 44 px

Avoid putting status text inside action buttons.

Cards

Each card must have:

Clear purpose
Header or identifiable primary content
Consistent padding
No unnecessary nested borders
At most one dominant primary action
Tabs and segmented controls
Use segmented controls for switching views of the same object, such as Board/Coach.
Use tabs for separate sections.
Communicate selection with background, text contrast, and optionally an indicator—not color alone.
Forms

Replace browser-default controls with accessible custom-styled controls while preserving native semantics.

Every setting should include:

Label
Optional short description
Control
Validation/help text when required
Statuses

Use normalized statuses:

Not reviewed
Ready
In progress
Completed
Needs attention

Statuses should be visually quieter than primary actions.

Destructive actions
Put Delete inside an overflow menu.
Require confirmation.
Include the affected game name.
Make the primary confirmation explicitly destructive.
7. Responsive rules
Mobile:       0–639 px
Tablet:       640–1023 px
Desktop:      1024–1439 px
Wide desktop: 1440 px+


Core requirements:

No horizontal page scrolling at any width.
Every flex/grid child containing text must support shrinking.
Desktop grids collapse intentionally, not merely by wrapping.
Fixed bottom elements must account for safe-area insets.
Do not rely on hover.
Touch targets must be at least 44 × 44 px.
Preserve scroll position when switching Board and Coach.
Keep selected move synchronized between both tabs.
8. Accessibility requirements
Meet WCAG AA contrast.
Provide visible keyboard focus using a 2 px focus ring.
Never communicate move quality using color alone.
Add text/tooltips for move-quality symbols.
Provide accessible names for every icon button.
Support keyboard interaction for board playback.
Respect reduced-motion preferences.
Maintain 200% text zoom without clipping.
Use semantic headings and landmarks.
Announce coaching updates without aggressively interrupting screen-reader users.
Audio must never autoplay unless explicitly enabled.
Do not use emoji as the only accessible coach identity or control label.
9. Implementation priority
P0 — Fix broken experience
Eliminate mobile horizontal overflow on Progress.
Replace unreadable Progress chart.
Fix mobile move-history navigation.
Remove production debug controls.
Prevent bottom navigation from covering content.
Normalize buttons, inputs, radios, and checkboxes.
Move Delete actions into overflow menus.
P1 — Create professional consistency
Implement design tokens.
Create shared button, card, badge, segmented-control, input, and dialog components.
Redesign games into structured responsive cards/rows.
Redesign progress around focus, trend, evidence, and practice.
Redesign coach messages into lesson-oriented components.
Add collapsible desktop session panels.
P2 — Strengthen product differentiation
Add a weekly coaching focus.
Show progress changes over time.
Convert coach observations into trackable practice tasks.
Add “Show on board” from coaching messages.
Add coach preview and recommendation states.
Surface continuity: “This appeared in 3 of your last 5 games.”
10. LLM-ready implementation prompt

Copy the following prompt into the coding LLM:

You are redesigning FreeChessCoach, a responsive AI chess-coaching web
application.

PRODUCT PURPOSE

FreeChessCoach analyzes chess games, conducts move-by-move coaching sessions,
remembers recurring weaknesses across games, tracks improvement, and creates
practice assignments.

The product must feel like a calm, intelligent, premium personal chess coach.
It must not look like a default HTML form, generic admin dashboard, or raw
engine-analysis tool.

CORE UX PRINCIPLES

1. Prioritize learning over raw engine data.
2. Make the current lesson and next action obvious.
3. Preserve context between board, selected move, evaluation, and coach.
4. Use progressive disclosure for advanced analysis.
5. Design mobile layouts intentionally rather than shrinking desktop layouts.
6. Keep destructive and developer actions out of primary interfaces.
7. Use reusable, accessible components and centralized design tokens.
8. Do not change domain behavior unless required to correct a clear UX defect.

VISUAL SYSTEM

Use a calm neutral background, white surfaces, restrained borders, dark
green primary actions, and separate semantic colors for information, warning,
danger, and success.

Use these tokens:

Background: #F7F8F5
Surface: #FFFFFF
Subtle surface: #F1F3EE
Border: #DDE2DA
Strong border: #C8D0C5
Primary text: #17201A
Secondary text: #556159
Muted text: #778079
Primary green: #2F6B45
Primary hover: #275A3B
Primary soft: #E7F1E9
Danger: #B5472E
Danger soft: #FCEBE7
Warning: #A86613
Warning soft: #FFF3DD
Info: #3267A8
Info soft: #EAF2FC

Use Inter or Source Sans 3.

Typography:
- Page title: 32px/40px desktop, 24px/32px mobile, weight 700
- Section title: 20px/28px, weight 600
- Card title: 16px/24px, weight 600
- Body: 16px/24px
- Supporting text: 14px/20px
- Never use interface text below 12px

Use the spacing scale:
4, 8, 12, 16, 20, 24, 32, 40, 48, 64

Use 12px card radius, 10px input/button radius, and subtle shadows only where
they clarify elevation.

COMPONENT ARCHITECTURE

Create or standardize:
- AppShell
- DesktopSidebar
- MobileBottomNavigation
- PageHeader
- Button with primary, secondary, ghost, destructive, and icon variants
- Card
- Badge/StatusBadge
- SegmentedControl
- Tabs
- TextInput
- Checkbox
- RadioCard
- Dialog
- OverflowMenu
- EmptyState
- LoadingSkeleton
- GameCard/GameRow
- CoachMessage
- LessonCard
- PracticeAssignment
- FocusAreaCard
- MoveTimeline
- PlaybackControls
- EvaluationSummary
- ResponsiveChessWorkspace

Avoid page-specific duplicated styles.

GAMES PAGE

Create a compact page header with:
- Title: Games
- Description: Review your games and continue coaching sessions
- Primary action: Analyze game
- Secondary action: Play coach

Separate game status from game action.

Allowed statuses:
- Not reviewed
- Ready
- In progress
- Completed

Allowed contextual actions:
- Start session
- Continue
- Review

Each game entry must show:
- Player names
- Result
- Date
- Source or time control when available
- Coaching status
- One primary contextual action
- Overflow menu

Move Delete into the overflow menu and require a confirmation dialog.
On mobile, use stacked cards and never truncate both player names until the
game cannot be identified.

SESSION PAGE — DESKTOP

Use a three-panel workspace:
- Left: 280–320px for move list, playback, and collapsible notes
- Center: flexible board area, minimum 620px where viewport permits
- Right: 360–420px coach panel

Allow left and right panels to collapse.

Keep these states synchronized:
- Selected move in move list
- Board position
- Evaluation
- Timeline position
- Related coach message

Place the evaluation timeline directly beneath the board.
Remove all debug controls from production UI.

SESSION PAGE — MOBILE

Use a compact session header and a Board/Coach segmented control.

Board tab:
- Board fills available width with 8–12px side padding
- Evaluation display must not crowd the board
- Use accessible playback controls
- Use a horizontally scrolling move timeline
- Automatically scroll the selected move into view
- Present “Explore this position” as an explicit action
- Clearly indicate when exploration mode is active

Coach tab:
- Use structured CoachMessage or LessonCard components
- Differentiate Observation, Question, Hint, Key lesson, and Practice task
- Include explicit Play audio and Show on board actions
- Do not place tiny playback triangles inside paragraph text
- Composer placeholder: “Ask about this position…”
- Offer contextual suggested replies when appropriate

During an active mobile session, prevent global bottom navigation from
competing with or covering session controls. Either hide it or provide
sufficient spacing and a session-specific navigation treatment.

PROGRESS PAGE

The first viewport must answer:
- What should the player focus on?
- Is the player improving?
- What should the player practice next?

Structure:
1. Weekly focus summary
2. Focus areas
3. Trend
4. Practice assignment
5. Recent lessons

Each focus area shows:
- Category
- Trend
- Maximum 2–3 line summary
- Evidence count
- View evidence action

Replace charts with rotated or clipped labels. Prefer horizontal bars, compact
sparklines, or ranked focus-area lists.

Practice assignments must be first-class interactive cards with:
- Clear goal
- Instructions
- Start practice action
- Mark complete action where applicable

On mobile:
- One card per row
- 16px page padding
- No fixed desktop widths
- No horizontal page overflow
- Long summaries clamp to three lines with Read more
- Charts must be readable at approximately 360px viewport width

SETTINGS PAGE

Set a maximum content width of approximately 960px.

Group settings into:
- Profile
- Coach
- Voice
- Preferences

Replace the raw coach radio list with selectable RadioCard components.
Each coach card should contain:
- Consistent avatar or illustration
- Coach name
- Short coaching-style description
- Optional style tags
- Preview voice action
- Strong selected state

Avoid emoji as the permanent icon system.
Show a sticky Save changes bar only when settings are dirty.

RESPONSIVE AND ACCESSIBILITY REQUIREMENTS

Breakpoints:
- Mobile: 0–639px
- Tablet: 640–1023px
- Desktop: 1024–1439px
- Wide desktop: 1440px+

Requirements:
- No horizontal page scrolling
- Add min-width: 0 to shrinking flex/grid children
- Minimum 44x44px mobile touch targets
- Visible keyboard focus
- WCAG AA contrast
- Do not communicate move quality or status using color alone
- Accessible labels for icon-only controls
- Support reduced motion
- Support 200% text zoom without clipping
- Preserve Board/Coach scroll state
- Account for mobile safe-area insets
- Audio never autoplays unless explicitly enabled

IMPLEMENTATION PROCESS

1. Inspect the existing components, routes, state management, and styling.
2. Identify reusable behavior before changing pages.
3. Add centralized design tokens.
4. Build shared primitive components.
5. Update one screen at a time in small, testable changes.
6. Preserve chess and coaching behavior.
7. Add visual and interaction tests for desktop and mobile.
8. Test at 360px, 390px, 768px, 1280px, and 1440px widths.
9. Verify all pages have no horizontal overflow.
10. Remove duplicated CSS and avoid deeply nested conditional rendering.

CODE QUALITY

Use small, self-describing components and functions.
Prefer early returns over nested if/else blocks.
Keep files focused on one responsibility.
Do not create giant page components.
Do not hard-code colors or spacing outside design tokens.
Do not redesign every workflow in a single unreviewable change.

For every implementation step, provide:
- Files changed
- UX behavior changed
- Responsive behavior
- Accessibility considerations
- Tests added or updated
- Any assumptions made


This direction preserves the strong existing functionality while making the product feel like a cohesive professional coaching platform rather than a collection of functional screens.