# Courses

The spec of courses on the platform: what a course is, how the app checks
one, publishes it and teaches it. Read the section a task points at, not the
whole file.

A **course** is a chess lesson built from a PGN: a public board where anyone
can play the lesson through, hear the coach, and drill it. Signed-in learners
get their progress kept and are reminded to review.

**Where courses come from.** Courses belong to the platform. They are made
outside the app by the **studio** (a separate local tool beside this repo,
run by Claude Code; it also makes, posts and measures the videos) and arrive
through the course API (§2). The app never writes course text and holds no
video code; the numbering below keeps the old section numbers, and the
making sections (5.1–5.3, 5.5, 5.6, 6, 8, 10, 12, 13 but 13.5) now live in the
studio's docs.

---

## 1. Words

| Word | Meaning |
|---|---|
| Course | One lesson: a tree of moves, its episodes, the texts and the coach. Has one kind (§3). |
| Line | One path through the tree (the main line, or a sideline). |
| Node | One move in the tree, with a stable id (`n1`, `n2` …) assigned by code from the PGN. Everything refers to nodes by id. |
| Chapter | A group of episodes on one line. |
| Episode | A stretch of nodes that teaches **one** point. |
| Ply | One move of an episode with its words: `text` (the coach's note), arrows, the tempting moves, and `course` (whether it speaks). An empty text means the move plays without words. |
| Tempting move | A move that looks right at a position and fails; found by code and the engine, with the engine's refutation (§13.5). |
| Level | Where a course sits in the curriculum: a rating (100 … 2800) and its place at that rating, shown as `1200-01`, `1200-02`. |
| Quiz | "Find the move" at a node: the coach sets the scene, asks, and the answer follows after the learner's move. |
| Mark | `@key`, `@quiz`, `@slow`, `@fast`, `@reel` or `@noeval` after a move in the PGN: the author's instruction to code. |
| Dossier | Everything our code and the engine know about every node (§5.4). The only source of chess facts; the app builds it itself. |

---

## 2. Course editors and the course API

- `users.can_edit_courses boolean NOT NULL DEFAULT false`, granted and
  revoked by a moderator: `npx tsx apps/api/scripts/course-editor.ts grant <email>` / `revoke <email>`.
- Courses belong to the platform: **every editor sees and edits every
  course**. `courses.created_by` records who imported it first, nothing
  more; deleting that account keeps the course.
- Every editor route checks the flag on the server (`ForbiddenError`, 403);
  the web hides "Manage courses" without it.
- The editor routes (`routes/courses.ts`) are served twice with the same
  handlers: `/api/courses/*` for the signed-in browser (`/manage/courses`),
  and `/api/token/courses/*` for a tool holding an editor's **token**
  (`Authorization: Bearer fcc_…`). An editor makes and revokes tokens on the
  admin page (`/api/course-tokens`, session only); a token is shown once and
  stored as its SHA-256. It stops working when revoked or when its editor
  loses the flag. Threat model: T14.
- **Import** (`PUT …/import`, `{ slug, pgn, direction, document }`): new at
  that slug, or replacing the course there in place (id, status, published
  copy and learner progress kept). The app parses the PGN for the kind
  (`course-source.ts`), refuses a document whose tree, lines or named node
  ids differ from it, and builds the dossier (§5.4) with its own engine
  pipeline. The answer is the course with the publish check's problems
  (§7). The kind cannot change; a removed course's slug cannot be taken.
- Other routes: list, get, `PATCH` (status `draft`/`unlisted`/`public`,
  access level, `clipLinks`), delete, publish-check, publish (§9), and the
  note audio upload (§9).
- Revoking an editor stops new imports and publishing. Courses already
  public stay public until an editor or a moderator changes them (§9).

---

## 3. Course kinds

The author picks the kind. Each kind has its own shape checks (§3, at
import), its own verifier checks (§7) and its own drill mode (§11).

| Kind | Typical input | Course |
|---|---|---|
| `trap` | One line with a bait move, and sidelines: how the victim can defend, or what the trapper can play instead | Drill both sides: spring it and avoid it; a sideline becomes a `defence` or `alternative` episode |
| `opening` | A main line, and sidelines (PGN variations or a Lichess study) | Chapters per line, drill on every must-know move |
| `tactics` | Several games or positions on one motif | Concept, then examples easiest first, quiz each |
| `puzzle` | A position (`[FEN]`) and its solution, e.g. mate in 3 | Every learner move is a quiz; the checks, captures and threats at each |
| `master_game` | One full game, with the annotator's variations | Every move explained, Logical-Chess style; guess the move at critical moments; each variation is a `variation` episode |
| `endgame` | A position (`[FEN]`) and its technique, sidelines for the defender's tries | The goal and the idea, the technique with its only moves as quizzes, each defence |
| `lesson` | Any topic, in 1–6 examples (a line or a `[FEN]` each): how a piece moves, a pattern, a plan, one narrow theme | The idea, then examples easiest first, quiz each, a recap. A `tactics` course without the motif: the topic is only the direction |

**Learner side** is set in the document; the studio infers it where it can:
trap = the side that wins material or mates at the end of the line; master game =
the winner (a draw asks); puzzle and endgame = the side to move; openings = asked (White or
Black repertoire).

**Several start positions** (Phase 133). A `lesson` or `tactics` course may
be a PGN of several games, up to 6, each with its own `[FEN]` and its own
short line (`allowsSeveralStarts`, `MAX_COURSE_STARTS`). Each game is an
example: its lines are the course's lines, its first move is a root of the
tree (`parentId` null) and carries that game's `startFen`. Games are told
apart by a header line after movetext, so `[Event]` is not needed. The
document's own `startFen` is the first game's. Every other kind reads the
first game only. A PGN line number in an error counts from the top of the
whole text.

**A puzzle** needs a `[FEN]` and no sidelines; the form refuses it otherwise.
Where the engine finds a second good move at a solution move
(`unsoundNodeIds`), the checks warn, and the player accepts either.

**An endgame** (Phase 103) needs a `[FEN]` too (`endgameShapeProblems`), and
may have sidelines: the defender's tries.

---

## 4. The course document

One Zod schema in `packages/shared/src/course.ts`, stored as jsonb. Sketch:

```ts
CourseDocument = {
  version: 1,
  kind, title, promise,            // promise: "After this you can …" (one sentence)
  learnerSide: 'white' | 'black',
  levelBand: RatingBand,
  coachPersona: CoachPersona,
  startFen: string,                // the initial position unless the PGN sets one
  nodes: { id, parentId | null, san, uci, fenAfter, lineId,
           comment | null, arrows,
           marks: ('key'|'quiz'|'slow'|'fast'|'reel'|'noeval')[],   // M2
           glyph | null,                                    // '!', '??' … (M4)
           startFen? }[],                                   // root nodes of a lesson/tactics course with several [FEN]s (§3)
  lines: { id, name, note | null, leafNodeId }[],       // note: the section's `#` note (S2)
  chapters: { id, title, lineId, episodeIds }[],
  episodes: {
    id, role, focus,               // role per kind (COURSE_ROLES); focus = the one point
    startNodeId, endNodeId,
    plies: { nodeId, arrows: Arrow[],
             text,                 // the coach's note: stands alone, 1–2 sentences
             tempting?: { san, why, refutation? }[],  // §13.5; refutation from the engine
             course: boolean }[],  // speaks in the play-through
    quiz?: { answerNodeId, scene,   // scene: what is going on, never the answer (M7)
             prompt, hint, reveal },
    drillNodeIds: string[]         // learner moves that become drill positions
  }[],
  takeaways: string[],             // exactly 3
  level?: { rating, order },       // curriculum place: 1200-02 (§9); rating 100 to 2800
  series?: { name, position, total?, module? },   // "Chess From Zero, lesson 7 of 14" (§9)
  tags?: string[],                 // diagnostic tags: `hangs-piece` (lowercase words joined by hyphens, at most 20)
  sections?, readAlong?,           // a reading course's pages (§3)
  clipLinks: { youtube?, shorts?, instagram?, tiktok? }  // where the studio posted the course's videos
}
Arrow = { from: Square, to: Square, kind: 'idea' | 'threat' | 'best' }
```

The document is what a learner gets. The videos made from a course (their
lines, captions, the reel) are the studio's own files; the course keeps only
where they were posted (`clipLinks`), which the course page embeds.

- Node ids are assigned by code when the PGN is parsed and depend only on its
  text, so the app's parse and the studio's agree, and a re-import with the
  same PGN keeps them (note audio, §9, is keyed by the note's text).
- Learner progress is keyed by **position + move** (normalised FEN key + UCI),
  not by node id or episode, so a republished course with an extra sideline keeps
  everyone's history.
- The published version is a frozen copy (`published_document`); the studio
  imports a new draft and an editor publishes it again.

---

## 5. The engine facts

### 5.4 The dossier

Built by code, per line, by running the existing analysis steps on each line as
if it were a game (evals shared by position, so a position common to two lines
is analysed once). Engine calls go through the one engine pipeline (Lichess eval
index first), and every search of one build through one memo
(`SearchMemoEngineBackend`): a position asked for again with settings an
earlier search covers (a repetition, a tempting move the tree also plays) is
answered from that search, cut to the lines asked for. The review audit's
`analyseGame` puts Game Review's three-line searches of the game under the
same memo, so its dossier searches no position the review searched. Rendered compactly; routine nodes in a long game get one line,
candidate nodes get the full block.

Per node:
- The move, side, line, and move number.
- **Verdict words**, never numbers: the move-quality label (`classify-move.ts`)
  and the position before/after in words (the wording `eval-words.ts` uses:
  "about equal", "White is better", "Black is winning", "White has a forced
  mate in 3"; a mate's number of moves only when it is short and the search
  covers it, else "White has a forced mate": `mate-count.ts`,
  `docs/tactics-rework.md` §13).
- Book: in book or not, the opening name where the book names it
  (`opening-book.ts`), and **the book's other moves** from the position
  before (`bookSiblings`), printed when they stay in the same opening family
  (the name before the colon): at the Stafford's 3…Nc6, "the book also has:
  Nxe4 (Petrov's Defense: Damiano Variation); d6 (Petrov's Defense)". So the
  coach can say what the usual move is and where the lesson leaves it.
- **Lines the move opens** (`opens`, `lineChanges` in
  `piece-coordination.ts`, the review's own check): the mover's bishops, rooks
  and queens that gain at least 3 squares, "the light-squared bishop on c8,
  from 0 squares to 5" at 4…dxc6. None for a move out of check.
- A bishop is named by its squares' colour wherever it moves or is opened
  ("piece: the dark-squared bishop"), so the spoken lines can name the piece
  instead of the square.
- Engine best move and its line (SAN, at most 6 plies) when the course move is
  not the best, and **why it is better** in board facts: what it does, and
  each piece the played move left hanging that it keeps safe, and by what
  ("Nc3 keeps the rook on a1 safe: the queen on d1 now defends it").
- Board facts (`inspect-moves.ts`): what moved where (so a quiet move has a
  true fact too), captures, checks and **how the check can be answered**
  (blocks, captures of the checker, king moves), a back-rank mate, what it
  leaves hanging, forks it creates (named by piece; pawns left out), and when
  the opponent's best reply is forcing, whether the moved piece stopped
  guarding its square ("the queen stops guarding c1, where Qc1# follows").
  A mate says why, square by square: the checker, the king's squares that
  hold its own pieces, the ones covered and by what, and which adjacent
  attackers are guarded ("the bishop on f7 is guarded by the knight on e5").
- **Ideas** (`move-ideas/`, `docs/move-ideas.md`): why the move was played,
  as checked data, most telling first: what it threatens and stops, what it
  develops, controls, opens, prevents and prepares, what it does to the
  kings and the pawns ("prevents …Bg4, a pin | loosens the pawns in front of
  the king"). Built from a study of annotated master games.
- Tactics (the tactic detectors and `tactic-reason-text.ts`): motifs found,
  missed or allowed at this node, each with its checked sentence. Not the
  review's "you stopped them…" sentences: they are about a move nobody played,
  and models presented them as the point of the move.

The principle: the app supplies every chess fact; the author only puts the
facts it is given into words. When a course states something wrong, the fix
is a missing or misleading fact here, not an instruction to be careful.
- Alternatives: the engine's other top moves, each with what it would do
  (its own ideas) and the engine's line after it, and the tempting moves
  (captures, checks) with verdict words, so "why not X?" is answered from
  facts. A move
  that is checkmate lists no other top moves: the mate is the whole
  description.
- Flags: `quiz-eligible` (one move is clearly best: a win-percentage gap above
  `CONFIG.courses.onlyMoveGap` to the second move, or a mate where the second
  mates later or not at all; a slower mate is no second answer, and a
  puzzle's `unsoundNodeIds` are only moves that mate as fast), `critical` (from
  `critical-moments.ts`), `creator-comment` (the author's PGN comment, verbatim).

Per line: its name, where it leaves the book, and the end position's features
(`dossier-line.ts`, from `position-features.ts`: open and half-open files,
passed, isolated and doubled pawns, pawn majorities, where the kings stand),
which ground any talk of plans. Only where there is a plan to talk about: a
line that ends in checkmate has no such rows, and a decided end position (the
engine's best line there is a forced mate, or `CONFIG.courses.decidedCp` for
one side) lists only the winning side's passed pawns.

#### Sections

- **S1** The first section is the game: PGN headers (a `[FEN]` sets the
  start), then movetext. Without a `---` line the whole text is this one
  section, so a standard PGN reads exactly as before.
- **S2** A section's head is everything before its first move. A head line
  ending in `:` is the section's title. A head line starting with `#` is a
  note about the section. A head line of marks alone sets the section's
  pace (M3).
- **S3** A later section's movetext starts with a move number, which says
  where it starts: the main line's position before that move. `8. Bd5`
  starts before White's 8th move; `9... c4` before Black's 9th. In
  White's place `-`, `--`, `..`, `...` or `…` means "White's move as on the
  main line", so `9. - c4` is `9... c4`. The main line is the first move
  from each position of the tree built so far.
- **S4** Moves merge: a move that already exists from a position is the same
  node (the same position is the same node). A section whose first move is one past the main line's end
  continues the main line. To branch from a sideline, write `( )` inside
  the section that holds it, or write a section from the main line through
  the sideline's moves.
- **S5** The title and notes belong to the section's first new move. When
  that move is the game's first move or starts a branch, they are the
  line's name and the line's note. When it continues a line, the line is
  not new: the title and notes become the author's comment on that move.
- **S6** Errors, each with its text line: a later section with no move
  number ("Section "Defending" must start with a move number, like
  8. Bd5"); a move number the main line does not have; a `-` anywhere but
  White's place in a section's first move pair; an illegal move (as today).
- **S7** `#` starts a comment to the end of the line only as the first
  character of a word, so `Qc1#` stays a mate. After a move it is that
  move's comment, the same as `{…}` and `;`. Trailing dots (`....`) are
  ignored, as today.

#### Marks

- **M1** A mark is `@word`, written after a move: bare in the movetext or
  inside its `{…}` comment. It applies to that move. Several may follow one
  move.
- **M2** The marks:

  The parser keeps every mark on its node (`marks`); the app acts on these,
  and the studio reads the rest (`@slow`, `@fast`, `@reel`: the videos' pace
  and the reel) from the same node:

  | Mark | What the author says | What the app does |
  |---|---|---|
  | `@key` | this move is the point; focus here | flagged in the dossier; keeps its full block |
  | `@quiz` | the position before this move is a quiz step; this move is the answer | the engine's one-best-move rule does not apply to its quiz (M6) |
  | `@noeval` | this example is a teaching setup, not a game: say no engine verdict | the move and every move after it get no verdict words (see below) |
  **`@noeval`** (Phase 133, a `lesson` or `tactics` example such as a lone
  knight or a drill setup): put it on the example's first move. From that move
  on, the dossier says nothing the engine thinks of the position: `before`,
  `after`, `alternatives` (the other top moves and their verdicts),
  `bestInstead` and `mateAhead` are empty, the move's quality is not printed,
  a tempting move has no verdict and no "not the answer" line, and the
  player shows no evaluation bar for those moves. What the moves
  do stays: captures, checks, attacks, the tempting move's refutation and the
  material after it. Moves before it, and sidelines that leave the line before
  it, are unchanged.
- **M3** `@fast` and `@slow` may also stand in a head (S2) or before the
  first move of a `( )` variation: they then apply to every move that
  section or variation adds, nested variations included, except moves that
  carry their own `@fast` or `@slow`. Other marks in a head are an error.
- **M4** Glyphs are kept: `!`, `!!`, `?`, `??`, `!?`, `?!` (and `$1`–`$6`).
  `!` and `!!` count as `@key`. In a trap, when exactly one move of the
  victim on the main line carries `?` or `??`, that move is the bait. Every
  glyph is printed in the dossier as the author's.
- **M5** Errors: `@fast` with `@key`, `@quiz`, `@slow` or `!`/`!!` on one
  move; `@quiz` on a move of the other side (checked once the learner side
  is known); `@reel` on two moves; an unknown bare `@word` (the message
  lists the marks). Inside `{…}` an unknown `@word` is plain text.
- **M6** A mark of the author beats a rule of code: an `@quiz` move is
  asked even where the engine finds a second good move (the player accepts
  both, F5).
- **M7** The quiz step (the owner, 2026-10-01). The board stops on the
  position before the answer. First the coach sets the scene: what is going
  on in the position, without the answer. Then the question: which move
  would you play here? The learner plays a move on the board (Hint stays); a
  right move, or "Show the answer", plays the answer with the reveal, and
  the course continues. The course does not count down: it waits for the
  learner.

Arrows stay as they are: `{[%cal Ge2e4,Rd8h4] [%csl Gf7]}` (the same position is the same node).

---

## 7. The verifier (code, at import and before publishing)

`packages/chess-analysis/src/course/verify.ts` (each episode) and
`verify-voice.ts` (the whole course), pure, over the course's own text. The
import and the publish check run them (`draftCheckProblems`, `publish.ts`).
The studio runs the same exported checks (`verify-text.ts`,
`verify-pieces.ts`, `sentenceOpeners`) on its videos' lines. Each problem has
a code and a message an editor can read.

| Check | Rule |
|---|---|
| Nodes | Every `nodeId` exists and lies inside the episode (or is its quiz answer). Plies are in node order, one per move. |
| Moves | Every SAN token in `text`, the tempting moves' `why` and the quiz (the same move-token grammar the chat uses) is a lesson move, an engine best move/line or a listed alternative within the episode's nodes. |
| Tactic words | A motif word (fork, pin, skewer, discovered, double check, mate, trapped, deflection, …, from the detectors' vocabulary) appears only if the dossier lists that motif within the episode. |
| Numbers | No eval-looking numbers (`+1.3`, `-0.8`, "centipawn", "eval"). No `N%` unless the course's direction contains it. |
| Arrows | Each arrow is a legal move for either side in that position (the opponent's via `null-move-fen.ts`) or a threat the dossier lists. At most 2 per move. |
| Tempting | Every `tempting[].san` is one of the dossier's tempting moves at that node; a `why` that pastes the dossier's line ("answered by …", "(White is …)") is reported. |
| Node ids | No line, why or quiz text says a node id ("mate at n16"). |
| Lengths | Course lines at most 2 sentences (4 at critical nodes, 5 in a solve line); a ticked ply with no words is reported once ("n11 speaks but has no words; write them or untick it"). |
| Quiz | `answerNodeId` eligible; the reveal names the answer move in at least 6 words (why it works, not just the move); neither the hint nor the prompt names it (a puzzle run asked "Nf7+ or Ng6+?"). |
| Solve | In a puzzle's solve episode, every check among the dossier's tempting moves at a move is in that ply's tempting list; a solve line may have 5 sentences (`maxSolveNoteSentences`). |
| Phrases | None of `BANNED_GENERIC_PHRASES`, and never the word "dossier" (our word, not the learner's), nor "listed", "given line" or "the continuation". |
| Pieces | "the knight on d5", "your d1 bishop": that piece stands on that square in a position the line is about: the episode's positions and the lines its moves show (the better move, the tempting moves, the safe line). A safety line is about the board before the bait and the safe line, and after the bait only where it names the bait (`course/verify-pieces.ts`). The hook is not checked. |
| Marks | A quiz marked `@quiz` is asked even where the engine finds a second good move (the quiz check skips "not the one clearly best move" for it); the course then warns (`quiz`) that a second move also works. |
| Bait | A trap's bait line never plays the learner's answer: not its notation, not "the knight takes", not "take the pawn" (`baitProblems`, `givesAway`). A run said "Take the pawn; count king threats before folding" one move before "What does Black play here?". |
| Taken piece | On a move that takes back, "took your pawn" names the piece the move before took there, or the one this move takes (`takenPieceProblems`): a line said "White took your pawn. Taking back opens your bishop" on 4…dxc6, where White had taken the knight. |
| Voice | More than 2 lines in an episode starting with the same word; one line repeated in two episodes; a word that starts a sentence in 3 or more lines across the course ("Execute."), board words (White, the queen …) aside (`verify-voice.ts`). |

Publishing is allowed with problems only after an editor ticks "I checked
these".

**Golden facts snapshot.** A change to the dossier's facts (`board-facts/`,
`course/dossier*`, the review's notes on a line) is checked with
`npm run test:golden`: every golden course in `apps/api/test/fixtures/courses/`,
a fixture engine, no network. The snapshot must stay byte-identical in a move
or refactor; re-record it only when the change is meant to alter the facts,
with `GOLDEN_UPDATE=1 npm run test:golden`, and review the diff.

---

## 9. Publishing and the public course page

- Status: `draft` → `unlisted` (link works, not listed) → `public` (listed) →
  `removed` (moderator). New courses publish as `unlisted` by default.
- Members-only courses: besides its status, a course has an access level
  (`courses.access_level`, picked in the Publish dialog; 0 is everyone). A
  course at level N opens for course editors and for users whose
  `users.course_access_level` is N or more (set by a moderator with
  `apps/api/scripts/course-access.ts <email> <level>`; no route writes it).
  Levels stack: level 2 opens level 1's courses too. Today the highest is 1
  (`COURSE_MAX_ACCESS_LEVEL`). The no-login `/api/public/courses*` routes
  never return one (404, like a wrong link); signed in, the player and the
  catalogue read `/api/learn/courses*`, the same answers plus the
  members-only courses the user may open (`readableBy` in the courses
  repository). Enrollments, due reviews and Ask my coach use the same rule,
  so a user whose level is lowered loses those courses everywhere.
- An editor deletes a course, published or not, from its card on
  `/manage/courses` (trash can, then a dialog naming it; `DELETE
  /api/courses/:id`). The row goes with its audio rows and enrollments
  (cascade) and its files in the bucket; learner progress is keyed by
  position, shared with other courses, and stays.
- Publishing (`POST …/publish`, from the admin page's Publish dialog or a
  token): who can see it and the members' level; the draft must have a
  title, text and three takeaways (`publishBlockers`). The server re-runs the
  checks with the engine facts (`GET …/publish-check`: episode, move and
  message for each problem) and refuses while they find problems unless
  "I checked these" is ticked. `PATCH /api/courses/:id` changes the
  visibility later (`draft` takes a published course off the site) and
  where the videos were posted (`clipLinks`: the YouTube video on
  youtube.com/youtu.be; the reel on YouTube Shorts, instagram.com or
  tiktok.com; https only), on the draft and the published copy alike.
- **Note audio**: the studio voices each speaking note and uploads its MP3:
  `POST …/notes/:episodeId/:nodeId/audio-url` gives a signed URL for one key
  and size (at most `maxNoteAudioBytes`), then `PUT …/audio` records it. A
  note's audio is found by its text's hash, so a changed note needs new
  audio (`missingNoteAudio` lists those); publishing drops audio no
  published note uses. Paragraphs are joined with
  `NOTE_PARAGRAPH_PAUSE_S` of silence, which the player counts on. A note
  with no audio is read in the learner's own chosen voice.
- **The course's address** is its title in words, `/learn/stafford-gambit`
  (the studio picks the slug; the import keeps it): a link a person can read, say in a video
  and type. A word at the end that names the kind of lesson, not its subject
  ("trap", "course", "lesson"), is left off, and so are apostrophes:
  "Stafford Gambit trap" is `stafford-gambit`, "Noah's Ark Trap" is
  `noahs-ark`. The address is checked against every course row, removed ones
  too (`slugsStartingWith`): a second course of the same name counts up
  (`stafford-gambit-2`).
  The slug is set when the draft is made and is not changed after.
- Public route `/learn/:slug` (SPA outside the app shell, no login) and
  read-only endpoints `GET /api/public/courses/:slug` (the published copy,
  each note's audio URL in the bucket, each move's evaluation and quality
  from the engine pass, `evals`, `{}` without one, and the course's
  `seriesNeighbours`, `{ previous, next }`, each `{ slug, title, position }` or null)
  (`routes/public-courses.ts`). Drafts and removed courses are 404.
- **Catalogue**: `GET /api/public/courses?kind=&sort=&cursor=&limit=` lists
  `public` courses only (unlisted ones are for their link), 50 a page,
  cached 60 s. `sort=newest` (the default) pages with an opaque cursor (the
  row's `published_at` to the microsecond and its id); `sort=curriculum`
  orders by level (rating, then place, courses without a level last, then
  newest) and pages by offset. Each item: slug, title, promise, kind, level
  band, the curriculum `level` (or null), `series` (or null) and `tags`,
  coach, learner side, published date, episode and move counts. The Courses
  page's Browse section reads it. Nothing
  about the creator is sent: their display name defaults to their email's
  local part. Skip-auth entries in `values.yaml` (asserted by
  `deploy/helm/test.sh`); nginx serves `/learn/*` through its SPA fallback,
  like `/demo`. Rate limits, caching and the rest: `docs/threat-model.md` T13.
- The page (`features/courses/player/`) is a board view on Game Review's
  layout (`CourseBoardLayout.tsx`, Phase 87): on a desktop the explorer
  column (episodes, then the line's moves with their quality badges, the
  episode's lead-in faded), the board column (eval bar, board, Previous /
  the next step, eval graph) and the coach column (`CoursePane`: the
  coaching chat's header with the voice toggle, the note, the quiz, Ask my
  coach); on a phone the coach on top, the board edge to edge, a move strip
  and a bottom bar, with Ask my coach as a sheet. The header
  (`CourseHeader.tsx`) holds back, the title, the four stages (the stage bar,
  or a picker on a phone) and "⋮" (Start over). The move list and graph grow
  as the learner steps on, so a quiz answer never shows early. The board
  carries the film's effects: the move just played lit in `--last-move`, its
  quality badge on the square it landed on, and on checkmate the mated king
  filled and pulsing with the squares he cannot run to crossed out
  (`CoachBoard`'s `mateEffect`, on in Play through and the drills;
  `board/checked-king.ts` is shared with the film). The bar and graph show a
  mate as won (the engine gives a finished game 0). None of this runs an
  engine for the learner: the evaluations are the course's own engine pass,
  built once at import and sent with the course (`courseEvals`); the
  admin page's learner preview gets them too. No stage of the course runs
  an engine in the learner's browser. The videos
  are chips above the episodes: "Watch the video" and "Watch the reel", each
  a thumbnail, then a `credentialless` youtube-nocookie frame, since the app
  is cross-origin isolated; browsers without that open YouTube, and a reel on
  Instagram or TikTok opens there. A note's tempting moves fold under it
  ("Tempting: Qxc3+?", opened for the engine's answer and why it fails). A quiz waits for the learner's move (Hint and
  Show the answer too). A different move is answered softly, with no engine
  (the owner, 2026-10-12): "Nf6 is not the move we play here. Have another
  look.", the piece back where it was and the question still standing; it may
  be a good move, it is just not the lesson's. When it is one of the course's
  tempting moves there, its "why" is said in place of "Have another look."
  The last
  episode's button is "Practice ›", which opens the takeaways on their own
  Remember screen first. There is one address,
  `/learn/:slug`, for everyone: the player checks for a signed-in user and
  adds the account menu, saved progress and a way back to Courses.
  `/courses/:slug` redirects to it.
- Learners never make audio: the studio makes it once and uploads it (above).
  Each file has its own key in the bucket
  (`courses/<slug>/audio/<uuid>.mp3`, made at upload and never reused), so a
  URL never serves different audio, and learners fetch it from the bucket's
  custom domain at the edge (Cloudflare caches `.mp3` by default; a Cache Rule
  on that domain can raise the edge TTL, since a key never changes). The api
  serves no audio and holds no bytes; `GET /api/public/courses/:slug` carries
  each note's URL. The course JSON is cached 60 s (a removal shows within a
  minute).
- **The bucket** (`services/courses/audio-store.ts`): any S3-compatible store;
  Cloudflare R2 in production. Config: `COURSE_AUDIO_S3_{ENDPOINT,BUCKET,
  ACCESS_KEY_ID,SECRET_ACCESS_KEY}` and `COURSE_AUDIO_PUBLIC_URL`, all or none
  (Helm: `courseAudioStorage`; the endpoint, bucket and public URL are values,
  the two keys come from a Secret), plus `COURSE_AUDIO_S3_UPLOAD_ENDPOINT` when
  the browser reaches the bucket at another address than the api does (local
  dev: the compose MinIO). The api signs the upload URLs and deletes files
  (`lib/s3-sign.ts`, AWS SigV4, checked against AWS's published examples);
  only a course editor can ask for a URL. One-time Cloudflare setup: an R2
  bucket, a custom domain on it (e.g. `media.freechesscoach.org`; not the
  rate-limited r2.dev URL), a CORS rule allowing `PUT` from the site with the
  `content-type` header, and an R2 API token with Object Read & Write on that
  bucket only.
- Removing a course: `npx tsx apps/api/scripts/course-remove.ts <slug>` sets
  `removed`, deletes its files from the bucket, and prints the prefixes to
  purge in Cloudflare (the api's and the bucket domain's), since the edge may
  hold copies for up to a year. Editors take a course off the site with
  `PATCH` (`draft`) or delete it; `removed` stays a moderator's.
- **Manage courses** (`/manage/courses`, editors only): every course as a
  card (kind, level code, Draft/Unlisted/Public/Removed, title, promise,
  moves and episodes; Manage, Open once published, Delete), filtered All /
  Drafts / Published and sorted Newest or Curriculum, and the editor's API
  tokens. `/manage/courses/:id`: the checks, the notes without audio, Preview
  as learner, Publish, the visibility of a published course, and the posted
  videos' links. No text is edited here; the studio imports the course again.
- **Curriculum.** A course's `level` places it: all courses at one rating
  form that rating's curriculum, in `order` (1200-01, 1200-02 …), both set
  by the studio. Browse and the admin page sort by it; Browse groups the
  courses under their rating.
- **Series** (Phase 133). `series: { name, position, total?, module? }` puts
  a course in a series (the platform's courses with the same `name`):
  "Chess From Zero, lesson 7 of 14", set in the imported document. Browse in Curriculum order lists a
  series as its own block before the levels, lessons by `position`, under
  their `module` headings, each card "Lesson 7 of 14"; Newest ignores series.
  A lesson page shows "name, lesson n of N · module" under the header with
  links to the public lessons before and after (`seriesNeighbours`: the
  nearest lower and higher `position` among the series' `public` courses; an
  unlisted lesson is never linked). `tags` are diagnostic tags
  (`hangs-piece`, `no-scan-before-move`): lowercase words joined by hyphens,
  at most 20 and 40 characters each, in the catalogue item and the document,
  nothing in the app reads them yet.
- **Up next** (top of `/learn`; `up-next.ts`). To do: the course with the
  most moves due ("Review 3 moves"), the unfinished course touched last
  ("Continue"). Coming: the lessons still to start of the series the learner
  is in, three at most. A learner in no series gets the first lesson of a
  series at their own rating band (else the first series) as "Start the
  series". Browse is below it in a section collapsed by default.
- **Preview as learner** on the admin page is the same `CoursePlayer` on
  the draft, with the note audio the studio uploaded (`noteAudio`).
- The evaluations come from the course's dossier (§5.4, each node's
  `evalAfterCp`). `npx tsx apps/api/scripts/course-dossier-refresh.ts [slug …]`
  rebuilds dossiers with the engine alone (no AI call) when their shape
  changes.

---

## 11. Learning a course: four stages, review, the Courses page

The stages (`COURSE_STAGES`; `packages/chess-analysis/src/course/stages.ts`):

1. **Play through**: each episode on the board with arrows, the coach's notes
   and voice, and the quiz; it ends with the takeaways (Remember).
2. **Practice**: the learner plays their own moves; the opponent's are
   played for them. Each move goes arrow → some arrows (every other move
   keeps its arrow) → no arrow → cleared, one step per correct round; a miss
   brings its arrow back. Rounds repeat until every move is cleared ("Round 2
   of 3", a progress bar, what the next round shows). Practice never touches
   the review schedule.
   **A line is one run.** In practice and both drills, the episodes of one
   chapter that each go further down the same line are played as one
   sequence, from the first one's first move to the last one's last
   (`lineRuns` in `review-schedule.ts`): a trap's setup, its answer and its
   punishment are 8 moves in a row, 3 rounds. Played an episode at a time
   they were 9 loops, three of them the one knight move, with nothing for the
   arrows to thin out over. A sideline, or an episode that goes back up the
   line, is its own run; tactics and a master game keep one run an episode.
   **No engine in practice or the drills** (the owner, 2026-10-12): the
   course's move is the answer and any other move is a miss, said at once
   ("Nf6 is not it. Try again.") with the piece back where it was and "Show
   the move" beside it. When the move tried is one of the course's tempting
   moves there, its "why" is said instead of "Try again". The Play through
   quiz answers the same way, in softer words.
3. **Drill**: the learner's side only, no arrows (tactics: each example's
   move, whichever side plays it; master game: a guess at each move,
   scored).
4. **Full drill** ("Both sides"): every move of the line.

**Board sounds** (`apps/web/src/sounds/`, Settings > Board): stepping on
in the play-through plays the move's sounds, bad and great for either side
from the evaluations (a solved quiz plays great), and the note's voice
waits for them; in practice and the drills the learner's move knocks, the
auto-played reply knocks softer, and a wrong try plays bad.

While playing, the coach column keeps a move log across episodes: the move
to find on top (hidden in the drills; practice says what it does), then the
opponent's move with its note and the learner's previous move, each with a
pawn in its side's colour. A wrong move gets free feedback with no AI (the
quality label and the checked sentence); a move the engine rates about as
good is accepted with no penalty.

**Review schedule** per position + move (`course/review-schedule.ts`), from the drill
and full drill only: a correct first try moves it to the next step, due after
1, 3 and 9 weeks, then mastered; a miss sends it back, due tomorrow. Days are
the learner's own calendar day. Signed in it is the `course_progress` table
(`POST /api/course-progress/drills`, `/lookup`, `/import`,
`GET /api/course-progress/due?today=`); the Games page's "Due today" rail
opens the drill.

**Where the learner is** (`course_enrollments`, migration 0021): the stage,
the play-through's episode and step, practice's per-move state, the line and
move of the Practice or drill run in progress (`place.run`: an episode id and
the moves of it played; a drill reopens there, a new round starts from the
top, and the first-try counts of the run start again), the words for it on
the Continue card (`place.where`, "Greedy · move 3"), the stages done;
`completed_at` once the full drill is done (kept if they go back).
`GET /api/course-enrollments`, `PUT` / `DELETE /api/course-enrollments/:slug`.
The player saves as the learner moves (debounced) and reopens there;
"Start over" (the header's menu) resets it. Unfinished courses join the
Games page's Continue rail, mixed with game sessions by last activity.

**The Courses page** (`/learn`, `features/courses/learn/`, public; `/courses` redirects to it; Learning and Learned show only signed in): Learning
(unfinished, with the stage and a remove button), Browse (the §9
catalogue, sorted Curriculum (the default, grouped by rating, each card with
its level code) or Newest, kind filter pills, a Learning/Learned badge) and Learned
(finished, with moves due). The navigation reads Games, Courses, Progress,
Stats; Play with Coach and Play a Bot start from the Games page. Course
editors manage courses at `/manage/courses` ("Manage courses" in the account
menu).

Without login everything but review and Ask my coach works, kept in the
browser (`fcc.courseProgress.v1`, `fcc.courseEnrollments.v1`); signing in
moves it to the account, the newer copy winning.

**Ask my coach** is `POST /api/course-questions` (signed in, the learner's
own AI setup and persona, nothing stored; prompt
`packages/prompts/src/course/ask-coach.ts`): it is given the course line and
notes and may check moves and the engine; where they disagree, the engine
wins. Offered in the play-through, not while a quiz asks and not in the
drills. Signed out, the same button explains that coaching needs an account.

---

### 13.5 Tempting moves

Code finds them (`course/tempting.ts`, chess-analysis),
at every critical node, every quiz answer, and every learner move of a
puzzle or tactics course:

1. Candidates for the side to move: every check, every capture, every move
   that attacks an undefended piece or a piece worth more than the mover
   (`checks-captures-threats.ts`), except the move played and the engine's
   best.
2. Each candidate's position is analysed with the other dossier positions
   (one engine batch). A candidate is tempting when it loses at least 15
   points of the mover's win% against the best move, or walks into mate,
   and is not obvious: an answer that captures at once and leaves the mover
   `obviousLoss` (2) points down (a queen taking a defended piece) is seen
   at a glance, so it is dropped. A quiet answer that mates stays.
3. Keep at most 3, ordered checks, then captures by value taken, then
   threats. At a puzzle's or tactics course's learner move (the solver's
   move) the engine's ranked moves are candidates too, every check and
   capture is kept without the obvious-loss filter (a check that costs even
   `solveCheckDrop`, 5 win%, counts), a move that mates later or not at all
   where the best mates is kept anywhere, and up to 5 (`maxSolveTempting`).
4. Each gets what it does itself (its board facts), its refutation (the
   engine's reply and line, `pvSan`, at most 4 plies, never cut mid-exchange: `settledLine`), the board facts of
   the reply, and who takes what over the line (`board-facts/material.ts`), so
   the author words facts instead of working them out. The dossier text names
   each side: "Nxe5? Black's Nxe5 … captures the pawn on e5. White answers
   Bxb4: … captures the queen on b4. Over the line Black takes a pawn;
   White takes the queen; at the end White is a queen up (White is much
   better)". A mating course move gets none outside a puzzle or tactics
   course (two trap runs listed Nxe2? under Nf3#), and code keeps a node's
   tempting moves only in the first episode that discusses them; a safety
   episode keeps none.

Dossier (`CourseNodeFacts.tempting`):
`{ san, kind: 'check' | 'capture' | 'threat', does: string[], refutation: string[], after: string[], captures: string, verdict: string, balance: string }[]`
(`does`: the tempting move's board facts; `after`: the answer's, the first
being its own move).
A course may only discuss these; the verifier checks each named move.
Config: `CONFIG.courses.temptingDrop` (15), `obviousLoss` (2) and `maxTempting` (3); at most 6
candidates a node go to the engine.

The course shows them under the note ("Tempting: Qxf7+? Kxf7, and the
knight hangs").
