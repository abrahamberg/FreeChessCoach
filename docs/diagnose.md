Your central correction is right: an established **450–700 Chess.com Rapid player normally knows the ordinary rules and can complete legal games reliably**. Their main problems are more often hanging pieces, incomplete attack maps, missing checks or captures, basic tactical recognition, and moving too quickly. Basic piece-movement gaps belong mainly around **100–300**, although rare-rule gaps can persist much higher.

Two important qualifications:

- Chess.com uses a **Glicko-style rating**, not FIDE Elo. The document should say **Chess.com Rapid rating**, not “Elo.”
- Chess.com does not publish diagnosis-by-rating statistics. Therefore, the ranges below are current practical coaching priors, not official Chess.com data. A production system should recalibrate them periodically from its own established-account sample.

Below is the revised document.

---

# Chess.com Rapid Operational Diagnostic Glossary v2.0

Each final diagnosis should be narrow enough for one focused 1–2 week measurement and training cycle. Treatment instructions are excluded.

This is an extensible operational glossary, not a claim that every possible chess error has a permanent static entry. Openings, pawn structures, mating patterns, sides, and contexts may be parameterized.

Correct examples:

- `OP-14.M [Sicilian Najdorf, 6.Be3 e5, Black, move-order recall]`
- `PW-26.K [Maróczy Bind, break-side, ...d5 preparation]`
- `TA-07.R.D [defensive knight forks, after exchanges]`

The old example `PW-19 [Maróczy Bind]` was incorrect: `PW-19` is pawn overextension; the Maróczy break-side family is `PW-26`.

The system must never return only a parent label such as “opening,” “tactics,” “calculation,” or “pawn structures.”

---

# 0. Rating calibration

## 0.1 What the rating ranges mean

The column **Primary CR prior** means:

> The Chess.com Rapid rating interval in which this issue is most likely to be a primary, high-value coaching diagnosis.

It does **not** mean:

- Everyone in that range has the weakness.
- Players above the range cannot have it.
- Players below the range cannot understand the skill.
- The rating itself proves or disproves a diagnosis.

Knowledge versions usually cluster toward the lower half of a range. Complex, defensive, time-conditioned, or calculation versions may occur several hundred points higher.

For operational purposes, use **100** rather than zero as the lower boundary.

## 0.2 Approximate current Chess.com Rapid anchors

| Chess.com Rapid | Typical diagnostic emphasis |
|---:|---|
| **100–299** | Rules, check/checkmate, basic movement, elementary captures. |
| **300–499** | Ordinary rules mostly stable; hanging pieces, check awareness, elementary mates. |
| **500–699** | Can play complete games; one-ply safety, attack maps, basic motifs, impulse control. |
| **700–899** | Tactical recognition, board updating, forcing replies, basic opening principles. |
| **900–1099** | Candidate generation, calculation discipline, elementary endings and plans. |
| **1100–1299** | Mixed tactical recognition, defensive resources, basic structures and conversion. |
| **1300–1499** | Calculation width, evaluation, structured planning, technical endings. |
| **1500–1699** | More complex tactics, strategic transformations, defensive precision. |
| **1700–1899** | Selective calculation, prophylaxis, advanced structures and conversion. |
| **1900–2099** | Precision, move order, practical defense, advanced technical gaps. |
| **2100–2299** | Narrow context-specific leaks, high-complexity calculation and judgment. |
| **2300–2500** | Rare but consequential precision, state, move-order, and transfer failures. |

These labels are not equivalents of FIDE titles or FIDE ratings.

## 0.3 Keeping the ranges current

A production system should recalibrate the priors at least every six months:

1. Use established accounts with at least 40 rated games over multiple sessions.
2. Separate exact controls such as 10+0, 15+10, and 30+0.
3. Annotate opportunities before seeing the player’s move when possible.
4. Estimate confirmed-diagnosis rates in 100-point rating bins.
5. Control for account volatility, session length, opponent strength, and clock state.
6. Version-date every change to a rating prior.

---

# I. Diagnostic operating rules

## 1. Final diagnosis format

Canonical format:

> **Leaf skill . mechanism . direction + context + history**

Example:

> `TA-07.R.D — Knight-fork recognition failure; defensive direction; after exchanges; moves under 10 seconds; Persistent.`

### Direction codes

| Code | Direction |
|---|---|
| **O** | Offensive: using or creating the idea. |
| **D** | Defensive: detecting, preventing, or answering the idea. |
| **B** | Both directions are impaired. |
| **N** | Direction is not applicable. |

## 2. Failure mechanisms

| Code | Mechanism | Operational test |
|---|---|---|
| **K** | Knowledge gap | Cannot explain or solve the idea even after it is named. |
| **M** | Memory/retrieval gap | Previously demonstrated the knowledge but cannot retrieve it after delay without a cue. |
| **V** | Visual/board-model gap | Misidentifies pieces, attacks, blockers, legal squares, or changed lines. |
| **R** | Recognition gap | Understands and solves when cued but misses the idea in mixed positions. |
| **G** | Candidate-generation gap | Sees the relevant features but does not consider the needed move. |
| **C** | Calculation gap | Considers the move but calculates the line incorrectly. |
| **J** | Judgment gap | Calculates adequately but evaluates the result incorrectly. |
| **X** | Execution/process gap | Possesses the skill but fails to apply the required process before moving. |
| **L** | Fluency/latency gap | Performs correctly with unlimited time but too slowly for the relevant control. |
| **S** | State-conditioned gap | Failure is substantially concentrated under time pressure, fatigue, panic, tilt, or another defined condition. |

Do not classify an issue as `X` merely because the student says, “I saw it.” Require repeated evidence, clock data, or successful reconstruction.

## 3. Causal precedence

When several labels describe one incident, test upstream causes first:

> Rules → board model → board update → scan/process → recognition → candidate generation → calculation → judgment → state.

Examples:

- If the student cannot map knight attacks, diagnose `BV-06.V`, not primarily `TA-07.R`.
- If knight geometry is accurate and cued forks are solved, but mixed forks are missed, diagnose `TA-07.R`.
- If the fork is recognized but the move is never considered, diagnose `TA-07.G`.
- If the move is considered but a defensive reply is missed, diagnose `TA-07.C` or the more precise calculation leaf.

One primary diagnosis may have secondary manifestations, but the same causal episode must not be counted as five independent weaknesses.

---

## 4. Required evidence

### 4.1 Evidence tracks

A finding must identify its evidence source:

- **Game leak:** Repeated failure in rated games.
- **Knowledge inventory:** Direct rules, opening, or endgame probe.
- **Process finding:** Verbal reconstruction plus game behavior.
- **State finding:** Matched-context performance and prospective logging.
- **Curriculum-only gap:** Direct knowledge gap with little or no current game exposure.

Rare endgames may be confirmed by varied probes without waiting for game exposure. They should be marked **curriculum-only** unless they are affecting games.

### 4.2 Current game window

- Start with **30 recent rated games** in one exact time control.
- Expand to 60–100 games when relevant opportunities are rare.
- Do not automatically combine 10+0 with 15+10 or 30+0.
- Do not combine bullet, blitz, and rapid.
- Bullet may diagnose bullet-specific habits, not general chess understanding.
- Include wins, draws, and losses.
- Use the rating at the time of each game when the account is changing rapidly.

### 4.3 Core metrics

- **O:** Relevant opportunities.
- **E:** Independent failure episodes.
- **E/O:** Opportunity-adjusted failure rate.
- **hWDL:** Human-reachable preventable expected-score loss.
- **Severity:** Minor, meaningful, major, or decisive.
- **Spread:** Number of games, sessions, openings, sides, and contexts.
- **Peer deviation:** Difference from matched players in the same rating and control.
- **Clock relation:** Time used relative to clock remaining and position complexity.
- **Control performance:** A closely related skill that remains intact.

### 4.4 Opportunity definition

An opportunity counts only when:

1. The theme is objectively present.
2. The relevant move or prevention is reasonably findable at the student’s level.
3. The skill would materially affect the decision.
4. The position was not already diagnostically meaningless.
5. The incident is not merely a later consequence of an earlier causal error.

Do not count an obscure engine tactic as an opportunity simply because it appears in a best line.

### 4.5 Human reachability

A move is human-reachable when supported by at least one of:

- A meaningful find rate among matched peers.
- Agreement by qualified human reviewers.
- A stable, understandable line with a realistic search path.
- Successful discovery by the student in an unbiased reconstruction or probe.

### 4.6 Confidence

These are practical defaults, not immutable statistical laws.

| Level | Default requirement |
|---|---|
| **Insufficient** | Too few opportunities, contaminated data, or conflicting evidence. |
| **Signal** | At least two independent related incidents across more than one game or probe form. |
| **Probable** | Normally at least four failures from eight opportunities, spread across at least three games and two sessions, with peer or probe support. |
| **Confirmed** | Probable evidence plus a blinded mechanism-matched probe and successful differential testing. |

For high-level, low-frequency errors, three closely matched critical episodes may support a probable diagnosis, but not without detailed reconstruction.

An automated implementation should eventually use a game-clustered beta-binomial or comparable model rather than treating every opportunity as independent.

---

## 5. Standard verbal diagnostic sequence

The reviewer must not lead the student toward the suspected answer.

1. “What changed after the last move?”
2. “What did you think the position required?”
3. “What was the opponent threatening?”
4. “What candidate moves did you consider?”
5. “What was the opponent’s best reply to each?”
6. “Where did you stop calculating?”
7. “How did you evaluate the resulting position?”
8. “How much time did you have?”
9. “What, if anything, affected your state?”

Only afterward should the reviewer give a targeted test.

### Targeted test logic

- Fails after the idea is named → **K or V**
- Knew it previously but cannot retrieve it after delay → **M**
- Explains it correctly but maps the board incorrectly → **V**
- Solves cued positions but not mixed positions → **R**
- Recognizes the feature but never considers the move → **G**
- Considers the move but gives the wrong line → **C**
- Calculates the line but evaluates it incorrectly → **J**
- Performs accurately only with much more time → **L**
- Possesses the skill but repeatedly skips the process → **X**
- Performs normally except under a repeated condition → **S**

---

# II. Operational diagnostic glossary

# A. Data-quality gates

These are not student weaknesses.

| ID | Gate |
|---|---|
| **DQ-01** | Insufficient recent rated games. |
| **DQ-02** | Insufficient relevant opportunities. |
| **DQ-03** | Mixed time-control pools. |
| **DQ-04** | Missing or unreliable clock data. |
| **DQ-05** | Suggested improvement is not human-reachable at the student’s level. |
| **DQ-06** | Sample is dominated by one opening, opponent, side, or unusual session. |
| **DQ-07** | Student saw engine analysis before reconstruction. |
| **DQ-08** | New, provisional, or rapidly changing account rating. |
| **DQ-09** | Incidents occurred only in completely lost or trivial positions. |
| **DQ-10** | Theme classifier is uncertain or engine evaluation is unstable. |
| **DQ-11** | Several recorded errors belong to one causal blunder cascade. |
| **DQ-12** | Variants, odds games, unrated games, or nonstandard conditions contaminate the sample. |
| **DQ-13** | Disconnects, lag, device failure, or interface errors explain the result. |
| **DQ-14** | Assistance, sandbagging, account sharing, or rating manipulation is reasonably suspected. |
| **DQ-15** | Different Rapid formats were pooled despite materially different clock demands. |
| **DQ-16** | Only losses, only wins, or only engine-flagged blunders were selected. |
| **DQ-17** | Chess.com legality highlighting masks the student’s actual rules knowledge. Use a direct probe. |
| **DQ-18** | Session, sleep, interruption, or environmental metadata is missing for a state diagnosis. |
| **DQ-19** | Verbal testing is confounded by language or response format; use a nonverbal equivalent. |
| **DQ-20** | Board theme, orientation, display size, or accessibility settings may explain the visual error. |

The system must be allowed to return **Insufficient evidence**.

---

# B. Rules and piece geometry

Online games often conceal rules gaps because illegal moves are blocked. Confirm these with direct board tests.

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **RB-00** | Game-objective knowledge | 100–250 | Does not understand check, checkmate, or the objective of the game. |
| **RB-01** | Pawn movement versus capture | 100–250 | Confuses forward movement, diagonal capture, or direction. |
| **RB-02** | Knight-movement knowledge | 100–300 | Cannot consistently identify legal knight destinations. |
| **RB-03** | Sliding-piece ray knowledge | 100–350 | Misunderstands bishop, rook, or queen movement through blockers. |
| **RB-04** | King movement and adjacency | 100–300 | Allows adjacent kings or entry into an attacked square. |
| **RB-05** | Check-evasion knowledge | 100–400 | Cannot distinguish capture, block, or king-move responses to check. |
| **RB-06** | Castling-rule knowledge | 100–500 | Misunderstands moved-piece restrictions, occupied squares, or attacked transit squares. |
| **RB-07** | En-passant knowledge | 100–700 | Does not know when en passant is legal or how it changes lines. |
| **RB-08** | Promotion-choice knowledge | 100–550 | Misses promotion or assumes promotion must be to a queen. |
| **RB-09** | Absolute-pin legality | 200–800 | Treats a piece pinned to its king as legally free to expose the king. |
| **RB-10** | Stalemate-rule knowledge | 100–550 | Cannot distinguish stalemate from checkmate or a playable position. |
| **RB-11** | Repetition-rule knowledge | 250–1000 | Misunderstands threefold repetition or how it is applied online. |
| **RB-12** | Fifty-move-rule knowledge | 500–1500 | Does not know the no-pawn-move/no-capture counting condition. |
| **RB-13** | Insufficient-material and timeout knowledge | 150–900 | Misunderstands drawing material or Chess.com timeout outcomes. |
| **RB-14** | Check, mate, and stalemate classification | 100–400 | Misclassifies static test positions despite seeing the legal moves. |

---

# C. Board vision and attack maps

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **BV-01** | Own hanging-piece blindness | 250–1000 | Repeatedly leaves a piece freely capturable and misses its status in static tests. |
| **BV-02** | Opponent hanging-piece blindness | 250–1050 | Fails to take free enemy pieces despite adequate time and no complication. |
| **BV-03** | Undefended versus underdefended confusion | 400–1200 | Cannot distinguish zero defenders from too few defenders. |
| **BV-04** | Attacker–defender counting failure | 400–1350 | Counts exchanges on one square incorrectly before deeper calculation. |
| **BV-05** | Pawn attack-map blindness | 200–900 | Misses pawn-controlled squares or reverses pawn attack direction. |
| **BV-06** | Knight attack-map blindness | 250–1050 | Cannot map current or one-move-future knight attacks. |
| **BV-07** | Long-diagonal blindness | 300–1400 | Misses bishop or queen influence across a long diagonal. |
| **BV-08** | Rank/file ray blindness | 300–1350 | Misses rook or queen attacks across a rank or file. |
| **BV-09** | King-capture safety blindness | 200–850 | Believes the king can safely capture a defended unit. |
| **BV-10** | Last-move board-update failure | 300–1300 | Fails to update attacks and defenses after the opponent moves. |
| **BV-11** | Last-move purpose blindness | 500–1800 | Sees the move but not its threat, line, defender, break, or structural purpose. |
| **BV-12** | Removed-blocker blindness | 400–1700 | Misses a newly opened line after a move or capture. |
| **BV-13** | New-blocker blindness | 500–1750 | Calculates through a line that has become blocked. |
| **BV-14** | Vacated-square blindness | 550–1850 | Notices the destination but not the abandoned square or line. |
| **BV-15** | Destination-square safety blindness | 200–1150 | Does not verify whether the moved piece is safe on arrival. |
| **BV-16** | Self-exposure blindness | 350–1550 | A move exposes the king, queen, or another unit along an overlooked line. |
| **BV-17** | Backward/retreating-move blindness | 650–2050 | Search disproportionately excludes retreats and backward attacks. |
| **BV-18** | Edge/corner geometry blind spot | 300–1500 | Accuracy drops for pieces or targets near board edges and corners. |
| **BV-19** | Multi-attack tracking overload | 600–2200 | Attack-map accuracy collapses when several units are simultaneously attacked. |
| **BV-20** | Cross-board attention split | 800–2300 | Action on one wing causes repeated misses on the other. |
| **BV-21** | Check-status awareness failure | 100–650 | Does not reliably register that a king is currently in check. |
| **BV-22** | Loose-piece inventory failure | 300–1450 | Cannot consistently identify all undefended or tactically loose pieces. |

---

# D. One-ply move-safety process

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **MS-01** | Opponent-check scan omission | 250–1000 | Fails to list the opponent’s legal checks before moving. |
| **MS-02** | Opponent-capture scan omission | 250–1100 | Omits immediate profitable captures. |
| **MS-03** | Opponent-direct-threat omission | 350–1350 | Misses mate, promotion, trapping, or another direct one-move threat. |
| **MS-04** | Own-check generation omission | 250–1050 | Misses useful checks visible without deep calculation. |
| **MS-05** | Own-capture generation omission | 250–1050 | Misses immediately profitable captures. |
| **MS-06** | Own-direct-threat generation omission | 400–1450 | Considers checks and captures but not forcing threats. |
| **MS-07** | Automatic-recapture reflex | 300–1450 | Recaptures without checking intermediate or stronger moves. |
| **MS-08** | Final destination-safety omission | 250–1400 | Does not complete a final one-ply verification of the chosen move. |
| **MS-09** | First-attractive-move fixation | 350–1700 | Stops searching after finding one plausible move. |
| **MS-10** | Threat-priority failure | 500–1850 | Sees several threats but responds to the wrong one. |
| **MS-11** | Forcing-move ordering failure | 600–2000 | Finds forcing moves but examines them in an ineffective order. |
| **MS-12** | Board-reset process omission | 350–1700 | Can identify changes when prompted but does not habitually reset after each move. |
| **MS-13** | Candidate-delta scan omission | 350–1800 | Does not inspect what the candidate opens, closes, vacates, attacks, or abandons. |
| **MS-14** | Loose-piece scan omission | 350–1600 | Does not check the status of loose pieces before committing to a move. |

---

# E. Tactical motif diagnostics

Test offensive and defensive directions separately with 8–12 mixed, uncued positions plus game examples.

A tactical diagnosis is invalid until knowledge, geometry, recognition, candidate generation, calculation, judgment, and execution have been differentiated.

| ID | Atomic tactical object | Primary CR prior | Opportunity signature |
|---|---|---:|---|
| **TA-01** | Mate-in-one recognition | 100–650 | An immediate legal mate is available or threatened. |
| **TA-02** | Basic mate-in-two pattern | 250–950 | One forcing first move creates an elementary unavoidable mate. |
| **TA-03** | Escape-square control | 450–1500 | A mating net depends on controlling one or more flight squares. |
| **TA-04** | Back-rank weakness | 350–1250 | King lacks luft and a major piece can enter the back rank. |
| **TA-05** | Smothered-mate pattern | 500–1450 | Knight mating geometry exists against a boxed king. |
| **TA-06** | Fork/double-attack concept | 150–650 | Does not understand one unit attacking two valuable targets. |
| **TA-07** | Knight-fork recognition | 300–1200 | A knight can attack multiple valuable targets or threatens to do so. |
| **TA-08** | Pawn-fork recognition | 300–1200 | A pawn advance or capture attacks multiple pieces. |
| **TA-09** | King-fork recognition | 450–1450 | A safe king move attacks two pieces, usually after simplification. |
| **TA-10** | Sliding-piece double attack | 450–1550 | A queen, rook, or bishop creates attacks on separate targets. |
| **TA-11** | Absolute-pin recognition | 300–1050 | Moving the pinned unit would expose its king. |
| **TA-12** | Relative-pin recognition | 450–1350 | Moving the pinned unit loses a more valuable non-king target. |
| **TA-13** | Exploiting a pinned defender | 550–1650 | A pinned unit cannot adequately defend or recapture. |
| **TA-14** | Skewer recognition | 450–1400 | A valuable front piece must move, exposing a rear target. |
| **TA-15** | X-ray recognition | 600–1750 | A sliding unit attacks through an intervening unit or exchange. |
| **TA-16** | Discovered-attack recognition | 450–1500 | Moving one unit reveals an attack by another. |
| **TA-17** | Discovered-check/double-check recognition | 500–1650 | A revealed line gives check, possibly with the moving unit. |
| **TA-18** | Removal-of-defender recognition | 550–1700 | A target becomes vulnerable after a defender is removed. |
| **TA-19** | Overload recognition | 700–1900 | One defender has incompatible defensive duties. |
| **TA-20** | Deflection recognition | 700–1950 | A defender is forced away from its duty. |
| **TA-21** | Decoy/attraction recognition | 800–2050 | A piece is forced onto a tactically vulnerable square. |
| **TA-22** | Interference recognition | 950–2250 | A move interrupts communication between attacker and defender. |
| **TA-23** | Square-clearance recognition | 750–1950 | A unit moves or sacrifices itself to free a critical square. |
| **TA-24** | Line-clearance recognition | 850–2100 | A unit vacates a rank, file, or diagonal for another piece. |
| **TA-25** | Line-opening/line-closing tactic | 750–2100 | A move opens or closes a decisive line. |
| **TA-26** | Trapped-piece recognition | 450–1600 | A piece lacks safe squares and can be won through restriction. |
| **TA-27** | Zwischenzug recognition | 650–1900 | A forcing intermediate move is stronger than the expected recapture. |
| **TA-28** | Intermediate-check recognition | 600–1850 | A check inserted before recapturing changes the sequence. |
| **TA-29** | Desperado recognition | 700–1900 | A doomed unit gains material or tempo before capture. |
| **TA-30** | Promotion-tactic recognition | 450–1550 | A promotion threat changes tactical priorities. |
| **TA-31** | Underpromotion recognition | 950–2250 | Promotion to rook, bishop, or knight is uniquely superior. |
| **TA-32** | Stalemate-resource recognition | 450–1650 | The losing side can remove its legal moves or sacrifice material. |
| **TA-33** | Perpetual-check recognition | 650–2150 | Repeated checks force a draw or prevent a loss. |
| **TA-34** | Counter-tactic recognition | 750–2200 | A threat should be answered by a stronger forcing threat. |
| **TA-35** | Defensive only-move tactic | 950–2400 | One tactical resource uniquely avoids major loss. |
| **TA-36** | Quiet tactical move | 1150–2500 | The best tactical move is not a check, capture, or immediate threat. |
| **TA-37** | Tactical move-order precision | 900–2350 | Correct motifs are seen but played in the wrong sequence. |
| **TA-38** | Multi-motif combination | 1200–2500 | Final diagnosis names the exact combined motifs. |
| **TA-39** | Tactical exchange sacrifice | 1300–2500 | Rook for minor piece creates concrete tactical gain or a forced attack. |
| **TA-40** | Domination/trapping net | 1300–2500 | Several moves remove all useful squares from a piece. |
| **TA-41** | Classic king-sacrifice pattern | 750–2150 | Exact pattern required: Greek gift, h-file clearance, and so on. |
| **TA-42** | Defensive interposition tactic | 550–1900 | A block or interposition neutralizes a line or forcing sequence. |
| **TA-43** | Loose-piece tactical targeting | 300–1350 | The tactic begins by identifying an undefended or tactically loose unit. |
| **TA-44** | Named mating-pattern retrieval | 450–2200 | Exact pattern required: Arabian, Anastasia, Boden, corridor, hook mate, etc. |
| **TA-45** | Windmill/repeated discovered attack | 800–2100 | Repeated discovered checks or attacks create a forcing material sequence. |

---

# F. Candidate generation, calculation, and visualization

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **CA-01** | Single-candidate search | 400–1900 | Normally produces only one serious candidate in critical positions. |
| **CA-02** | Unpruned candidate overload | 1200–2500 | Considers too many low-value candidates and cannot allocate depth. |
| **CA-03** | Opponent-forcing-reply omission | 450–2000 | Omits one or more opponent checks, captures, or direct threats. |
| **CA-04** | Quiet-candidate omission | 900–2500 | Search includes forcing moves but excludes improving or restrictive moves. |
| **CA-05** | Prophylactic-candidate omission | 1000–2500 | Does not generate moves whose main purpose is stopping the opponent. |
| **CA-06** | Assumed-recapture error | 400–1700 | Assumes the opponent must recapture and ignores alternatives. |
| **CA-07** | Natural-reply substitution | 700–2200 | Calculates against a plausible reply instead of the strongest reply. |
| **CA-08** | Stops after apparent gain | 500–1800 | Ends calculation immediately after winning material or giving check. |
| **CA-09** | Failure to reach quiescence | 650–2200 | Evaluates while forcing moves or unresolved captures remain. |
| **CA-10** | Insufficient calculation depth | 600–2200 | Stops one move before the decisive consequence. |
| **CA-11** | Insufficient branch width | 850–2350 | Calculates one line deeply but misses a critical alternative. |
| **CA-12** | Calculation move-order blindness | 750–2300 | Sees component moves but does not compare their ordering. |
| **CA-13** | Branch-merging error | 900–2300 | Combines features from different variations. |
| **CA-14** | Piece-location visualization drift | 600–2200 | Relocates or forgets a piece during calculation. |
| **CA-15** | Captured-piece reappearance | 500–1800 | Treats a captured piece as if it still exists. |
| **CA-16** | Line-state visualization drift | 700–2300 | Forgets a changed file, diagonal, square, or pawn structure. |
| **CA-17** | Leaf-position material-count failure | 450–1700 | Visualizes the final board but counts its material incorrectly. |
| **CA-18** | Leaf-position evaluation failure | 900–2500 | Visualizes the final board but evaluates the wrong factors. |
| **CA-19** | Candidate-comparison failure | 1000–2500 | Calculates lines but does not compare them from one consistent root. |
| **CA-20** | Confirmation-biased calculation | 700–2400 | Searches for support for the favored move more deeply than for refutations. |
| **CA-21** | Critical-moment recognition failure | 700–2500 | Does not recognize when deeper calculation or extra time is required. |
| **CA-22** | Selective-depth misallocation | 1400–2500 | Overcalculates low-risk branches and undercalculates the critical one. |
| **CA-23** | Hidden defensive resource omission | 1100–2500 | An otherwise correct attack misses an unexpected defense. |
| **CA-24** | Only-move search failure | 1000–2500 | Searches for a good move when the position requires the only viable move. |
| **CA-25** | Sacrifice-verification failure | 700–2300 | Sacrifices without proving recovery, mate, perpetual, or compensation. |
| **CA-26** | Tactical-to-positional horizon failure | 1200–2500 | Calculates the forcing sequence but not the resulting long-term position. |
| **CA-27** | Transposition-recognition failure | 1400–2500 | Recalculates equivalent branches or evaluates them inconsistently. |
| **CA-28** | Calculation-efficiency deficit | 1500–2500 | Reaches correct conclusions only through repetitive, disorganized search. |
| **CA-29** | Ghost or illegal move in calculation | 350–1600 | Calculates a move that is illegal or depends on a nonexistent line or piece. |
| **CA-30** | Root-position encoding failure | 400–1800 | Begins calculation with an inaccurate model of the current position. |

---

# G. Time management and mechanical execution

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **TM-01** | Critical-move impulse speed | 200–2100 | Critical errors are played in seconds despite substantial remaining time. |
| **TM-02** | Opponent-rhythm entrainment | 200–2200 | Replies become unusually fast when the opponent moves quickly. |
| **TM-03** | Time-to-complexity mismatch | 400–2500 | Time expenditure correlates poorly with decision complexity. |
| **TM-04** | Forced-move overthinking | 500–2200 | Excessive time is spent on nearly forced responses. |
| **TM-05** | Opening-time sink | 500–2200 | Excessive early time produces no corresponding decision improvement. |
| **TM-06** | Missing middlegame reserve | 500–2400 | Clock is repeatedly depleted before the main critical phase. |
| **TM-07** | Unused-clock blundering | 200–2000 | Preventable rapid errors occur with substantial time remaining. |
| **TM-08** | Chronic time-trouble entry | 400–2500 | Repeatedly reaches a defined phase below a safe clock threshold. |
| **TM-09** | Time-trouble blunder cascade | 300–2300 | One low-time error is followed by several rapid errors. |
| **TM-10** | Clock-threshold performance drop | 300–2400 | Quality falls sharply below a consistent clock threshold. |
| **TM-11** | Candidate cycling/perfectionism | 700–2500 | Returns repeatedly to rejected lines while seeking certainty. |
| **TM-12** | Session-fatigue degradation | 100–2500 | Opportunity-adjusted error rate rises in later games of a session. |
| **TM-13** | Fast-control habit transfer | 200–2100 | Rapid games show blitz-like move times despite available clock. |
| **TM-14** | Premove misuse | 100–1600 | Premove or near-premove behavior causes avoidable update errors. |
| **TM-15** | Distraction-conditioned error rate | 100–2500 | Errors cluster in interrupted or multitasking sessions. |
| **TM-16** | Increment-use failure | 300–2400 | Pacing fails to account for the presence or absence of increment. |
| **TM-17** | Phase-transition clock failure | 500–2500 | Time use does not adjust when the game enters a tactical or technical phase. |

### Interface and mechanical findings

These are reported separately from chess-understanding weaknesses.

| ID | Finding | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **MX-01** | Recurrent mouse/touch mis-input | 100–2500 | Repeated input errors arise from a reproducible interface habit. |
| **MX-02** | Board-orientation mapping failure | 100–900 | Accuracy changes substantially when the board is flipped. |
| **MX-03** | Coordinate-notation fluency gap | 100–1200 | Slow coordinate retrieval interferes with study, communication, or calculation recording. |
| **MX-04** | Move-confirmation omission | 100–2000 | Student repeatedly commits an unintended move without final interface verification. |

Isolated slips should trigger `DQ-13`, not a student diagnosis.

---

# H. Opening diagnostics

Every final opening diagnosis must identify the opening, side, branch or structure, and recurring error.

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **OP-01** | Early central-control neglect | 200–800 | Repeated early moves concede the center without concrete justification. |
| **OP-02** | Minor-piece development delay | 200–900 | Unnecessary moves leave the student behind in development. |
| **OP-03** | Repeated-piece development loss | 250–950 | One piece moves repeatedly while others remain undeveloped. |
| **OP-04** | Premature queen activity | 200–1000 | Early queen moves invite tempos or replace necessary development. |
| **OP-05** | Castling/king-safety timing failure | 300–1250 | Leaves the king exposed or castles automatically into danger. |
| **OP-06** | Premature flank-pawn movement | 250–1100 | Nonessential flank moves create weaknesses or delay development. |
| **OP-07** | Opening move-safety failure | 200–1250 | Opening losses come from immediate hangs or one-ply tactics, not theory. |
| **OP-08** | Opening material-greed failure | 400–1500 | Takes or keeps material despite visible development or king-safety costs. |
| **OP-09** | Core-line recall gap | 700–2500 | A previously studied branch cannot be retrieved. Exact branch required. |
| **OP-10** | Rote sequence without causal understanding | 600–1900 | Remembers moves but cannot explain threats, breaks, or placements. |
| **OP-11** | Early-deviation adaptation failure | 700–2100 | Continues memorized moves after the opponent’s deviation changes the position. |
| **OP-12** | Opening-transposition recognition failure | 950–2450 | Knows both positions but does not recognize the move-order transposition. |
| **OP-13** | Repertoire-adherence failure | 600–2200 | Repeatedly abandons the agreed repertoire without a conscious reason. |
| **OP-14** | Recurring branch-specific leak | 700–2500 | Same branch produces the same move, misconception, or process failure. |
| **OP-15** | Opening clock-allocation failure | 500–2350 | Known positions consume excessive time or unfamiliar ones are rushed. |
| **OP-16** | Gambit-handling failure | 400–1900 | Exact subtype required: acceptance, return, development, or decline. |
| **OP-17** | Failure to punish an opening error independently | 600–2100 | Continues repertoire mechanically after an inferior opponent move. |
| **OP-18** | Opening-to-middlegame discontinuity | 750–2300 | Book moves are adequate, but the first independent plan is incoherent. |
| **OP-19** | Model-position knowledge gap | 850–2450 | Lacks standard placements, exchanges, pawn breaks, or endgames. |
| **OP-20** | Novel-position candidate failure | 1150–2500 | Candidate quality falls disproportionately outside preparation. |
| **OP-21** | Advanced opening move-order imprecision | 1750–2500 | Permits a precise resource through inaccurate move order. |

---

# I. Evaluation diagnostics

Use tactically stable positions unless the diagnosis is explicitly about dynamic evaluation.

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **EV-01** | Current-material counting failure | 200–750 | Cannot state the present material balance correctly. |
| **EV-02** | Contextual piece-value failure | 300–1200 | Uses fixed numerical values despite trapping, promotion, or mating conditions. |
| **EV-03** | Exchange-arithmetic failure | 250–1100 | Miscalculates material after a straightforward exchange sequence. |
| **EV-04** | King-safety underweighting | 400–1700 | Prefers material or structure while underestimating king exposure. |
| **EV-05** | Phantom-attack overvaluation | 500–1800 | Overvalues an attack with too few attackers or insufficient access. |
| **EV-06** | Development/tempo undervaluation | 300–1100 | Treats early material gains as free while ignoring initiative. |
| **EV-07** | Piece-activity valuation failure | 550–1900 | Exact piece and activity feature must be named. |
| **EV-08** | Space-advantage valuation failure | 650–2000 | Ignores useful space or overvalues space without breaks and access. |
| **EV-09** | Pawn-weakness severity misjudgment | 650–2100 | Exact weakness required: isolated, backward, doubled, fixed, etc. |
| **EV-10** | Initiative-versus-material misjudgment | 850–2300 | Misweights temporary activity against lasting material. |
| **EV-11** | Pawn-sacrifice compensation misjudgment | 950–2350 | Weights development, files, king safety, or structure incorrectly. |
| **EV-12** | Exchange-sacrifice compensation misjudgment | 1150–2500 | Misvalues rook versus minor piece plus activity or control. |
| **EV-13** | Bishop-pair valuation failure | 850–2250 | Overvalues or undervalues the pair relative to structure and openness. |
| **EV-14** | Bishop-versus-knight misjudgment | 750–2300 | Evaluates nominal type rather than squares, pawns, and mobility. |
| **EV-15** | Queen-versus-pieces imbalance misjudgment | 1200–2500 | Misvalues queen against rooks or several minor pieces. |
| **EV-16** | Exchange-imbalance misjudgment | 900–2300 | Misvalues rook versus minor piece and pawns. |
| **EV-17** | Static-versus-dynamic weighting failure | 1350–2500 | Overweights permanent features or temporary initiative. |
| **EV-18** | Endgame-transition evaluation failure | 900–2450 | Misjudges whether an exchange enters a favorable ending. |
| **EV-19** | Fortress/drawability evaluation failure | 1350–2500 | Treats an engine advantage as winning despite a drawing mechanism. |
| **EV-20** | Opposite-colored-bishop drawability | 900–2250 | Fails to adjust winning expectations appropriately. |
| **EV-21** | Evaluation-confidence miscalibration | 1200–2500 | Confidence remains high in repeatedly unreliable position types. |
| **EV-22** | Passed-pawn valuation failure | 500–1900 | Misvalues a passer’s speed, support, blockadability, or promotion potential. |
| **EV-23** | Win/draw/loss classification failure | 650–2300 | Misclassifies the objective result class of a stable position. |
| **EV-24** | Objective-versus-practical risk misjudgment | 1200–2500 | Chooses an objectively narrow line without accounting for practical risk. |

---

# J. Strategic planning and piece play

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **ST-01** | Aimless play after opening | 450–1500 | Cannot name a target, improving piece, break, or opponent plan. |
| **ST-02** | Worst-piece identification failure | 550–1700 | Improves active pieces while one piece remains ineffective. |
| **ST-03** | Opponent-plan identification failure | 700–2300 | Names own plans but omits the opponent’s plans and breaks. |
| **ST-04** | Piece-activity improvement failure | 650–2100 | Exact piece and improvement route must be named. |
| **ST-05** | Open-file use failure | 600–1800 | Fails to occupy or contest a useful open file. |
| **ST-06** | File-entry-square blindness | 850–2200 | Occupies a file but does not identify penetration squares. |
| **ST-07** | Rook-activation failure | 600–2000 | Rooks remain passive despite accessible files, ranks, or pawn support. |
| **ST-08** | Rook-coordination failure | 750–2100 | Rooks cannot support one another or are doubled without purpose. |
| **ST-09** | Knight-outpost recognition failure | 650–1950 | Misses a stable square that cannot be challenged by pawns. |
| **ST-10** | Knight-rerouting failure | 850–2250 | Identifies a poor knight but cannot find a practical route. |
| **ST-11** | Bad-bishop recognition failure | 550–1700 | Does not recognize restriction by its own pawns or blocked diagonals. |
| **ST-12** | Bad-bishop improvement failure | 750–2100 | Recognizes the problem but finds no exchange, break, or reroute. |
| **ST-13** | Bishop-pair utilization failure | 950–2250 | Keeps the position closed or exchanges the wrong bishop. |
| **ST-14** | Queen-placement failure | 850–2250 | Queen blocks pieces, becomes a target, or lacks coordination. |
| **ST-15** | Piece-coordination failure | 750–2200 | Pieces pursue unrelated targets or obstruct one another. |
| **ST-16** | Space-advantage utilization failure | 750–2100 | Cannot improve pieces, restrict counterplay, or prepare a break. |
| **ST-17** | Cramped-position handling failure | 850–2250 | Makes passive moves without seeking exchanges, breaks, or coordination. |
| **ST-18** | Weak-square exploitation failure | 750–2050 | Identifies a weak square but cannot occupy or use it. |
| **ST-19** | Color-complex control failure | 1050–2450 | Fails to connect pawn moves and exchanges to long-term square control. |
| **ST-20** | Fixed-target creation failure | 850–2200 | Cannot convert temporary pressure into a stable target. |
| **ST-21** | Second-weakness creation failure | 1200–2500 | Attacks one defended target without opening another front. |
| **ST-22** | Wing-switch timing failure | 1050–2450 | Switches too early, too late, or not at all. |
| **ST-23** | Favorable-exchange identification failure | 650–2100 | Exchanges by nominal value instead of resulting position. |
| **ST-24** | Key-piece preservation failure | 850–2250 | Trades the piece essential to the position’s plan or defense. |
| **ST-25** | Premature tension-release reflex | 550–1950 | Captures automatically without comparing maintenance of tension. |
| **ST-26** | Tension-maintenance failure | 850–2250 | Cannot identify when waiting improves the position. |
| **ST-27** | Irreversible-pawn-commitment failure | 700–2150 | Makes pawn moves without assessing permanent weaknesses. |
| **ST-28** | Counterplay-restriction failure | 950–2450 | Pursues an advantage without suppressing the opponent’s active plan. |
| **ST-29** | Positional-transformation failure | 1150–2500 | Misses the moment to alter structure, exchange, or convert advantages. |
| **ST-30** | Plan-inertia failure | 850–2350 | Continues an old plan after defining features change. |
| **ST-31** | Position-reevaluation failure | 950–2450 | Does not reassess after exchanges, breaks, or king-safety changes. |
| **ST-32** | Strategic move-order failure | 1500–2500 | Correct strategic operations are played in the wrong sequence. |
| **ST-33** | Second-order prophylaxis failure | 1800–2500 | Anticipates the first opposing plan but not the response after prevention. |
| **ST-34** | Central-break selection failure | 650–2200 | Misses or mistimes the central operation required by the position. |
| **ST-35** | Strategic target-priority failure | 700–2250 | Identifies several targets but selects the least useful one. |

---

# K. Pawn play and pawn structures

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **PW-01** | Playing with an IQP | 800–2100 | Misunderstands activity, breaks, placement, or liquidation. |
| **PW-02** | Playing against an IQP | 850–2200 | Fails to blockade, exchange correctly, or pressure the pawn. |
| **PW-03** | Playing with hanging pawns | 1000–2300 | Mismanages dynamic advance, space, or future weakness. |
| **PW-04** | Playing against hanging pawns | 1000–2350 | Cannot provoke, blockade, or target them appropriately. |
| **PW-05** | Backward-pawn handling | 750–2100 | Exact direction required: playing with it or attacking it. |
| **PW-06** | Doubled-pawn evaluation and use | 550–1900 | Treats doubled pawns as automatically bad or ignores their benefits. |
| **PW-07** | Pawn-chain base/head confusion | 500–1600 | Attacks or defends the wrong part of a chain. |
| **PW-08** | Closed-center wing choice | 700–2100 | Chooses the wrong wing or ignores chain direction and king placement. |
| **PW-09** | Open-center obligation failure | 550–1800 | Makes slow flank moves while central development or safety is urgent. |
| **PW-10** | Minority-attack schema gap | 900–2200 | Does not understand the target, exchanges, or resulting weakness. |
| **PW-11** | Passed-pawn creation failure | 550–1900 | Misses exchanges or breaks that create a passer. |
| **PW-12** | Passed-pawn blockade failure | 450–1800 | Fails to stop a passer before it becomes tactically dangerous. |
| **PW-13** | Outside-passed-pawn recognition | 700–2050 | Does not value or create a distant passer. |
| **PW-14** | Connected/protected-passer handling | 700–2100 | Misjudges when passers should advance or be blockaded. |
| **PW-15** | Majority/candidate-passer recognition | 650–2100 | Cannot identify which pawn can become passed after exchanges. |
| **PW-16** | Pawn-lever identification failure | 650–2200 | Misses the pawn contact that can alter the structure. |
| **PW-17** | Pawn-break preparation failure | 800–2350 | Finds the break but plays it before pieces support it. |
| **PW-18** | Pawn-break timing failure | 900–2450 | Conceptually correct break is mistimed. |
| **PW-19** | Pawn-overextension failure | 500–1800 | Gains space while creating unsupported pawns or weak squares. |
| **PW-20** | Pawn-island/fixed-target blindness | 500–1600 | Cannot distinguish mobile weaknesses from fixed targets. |
| **PW-21** | Reserve-tempo blindness | 800–2100 | Uses pawn moves without recognizing their waiting-move value. |
| **PW-22** | Pawn-race counting failure | 400–1500 | Miscounts promotion tempi, checks, or king routes. |

### Named-structure families

A bare family code is not a final diagnosis. Side, plan, and failed operation are required.

| ID | Structure-side family | Primary CR prior |
|---|---|---:|
| **PW-23** | Carlsbad: minority-attack side | 900–2200 |
| **PW-24** | Carlsbad: defending against minority attack | 1000–2300 |
| **PW-25** | Maróczy Bind: space-side plans | 1150–2450 |
| **PW-26** | Maróczy Bind: break-side plans | 1250–2500 |
| **PW-27** | Hedgehog: space-side restraint and breakthrough | 1350–2500 |
| **PW-28** | Hedgehog: break-side preparation | 1350–2500 |
| **PW-29** | French chain: attacking base versus head | 700–2100 |
| **PW-30** | Locked King’s Indian center: wing race | 950–2350 |
| **PW-31** | Benoni: breaks, majorities, and weak squares | 1050–2450 |
| **PW-32** | Stonewall: bishop problem and key squares | 850–2200 |
| **PW-33** | Symmetrical structure: creating timely asymmetry | 1200–2500 |

---

# L. Attacking play

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **AT-01** | Attack before development | 250–1250 | Starts a king attack with several pieces undeveloped. |
| **AT-02** | Wrong-sector attack | 500–1850 | Attacks on a wing despite the center or king placement favoring elsewhere. |
| **AT-03** | Insufficient attacking-force count | 400–1500 | Cannot compare attackers, defenders, and reinforcements. |
| **AT-04** | Queen-only attack | 250–1200 | Creates queen threats without integrating other pieces. |
| **AT-05** | Missing-attacker integration | 600–2000 | Attack stalls because the least active piece is not included. |
| **AT-06** | Failure to open attacking lines | 500–1900 | Keeps useful files and diagonals closed. |
| **AT-07** | Wrong attacking pawn lever | 700–2100 | Chooses a pawn advance that closes lines or exposes the king. |
| **AT-08** | Defensive-piece count omission | 600–2000 | Omits a defender that can participate. |
| **AT-09** | King-escape-square omission | 500–1800 | Calculates checks without tracking flight squares. |
| **AT-10** | Key-defender identification failure | 750–2200 | Does not identify which defender must be exchanged or deflected. |
| **AT-11** | Premature-check habit | 400–1600 | Gives checks that reduce attacking coordination. |
| **AT-12** | Forcing versus strengthening failure | 950–2350 | Forces play when a quiet strengthening move is superior. |
| **AT-13** | Wishful-sacrifice attack | 500–2000 | Chooses a thematic-looking sacrifice without sufficient proof. |
| **AT-14** | Counterplay omission during attack | 700–2200 | Ignores a stronger central or opposite-wing threat. |
| **AT-15** | Attack-race tempo miscount | 850–2300 | Misjudges whose threat lands first. |
| **AT-16** | Attack-abandonment timing failure | 900–2350 | Continues a dead attack or abandons a viable one too early. |
| **AT-17** | Attack-to-endgame transition failure | 1000–2450 | Rejects favorable liquidation because the original attack disappears. |
| **AT-18** | Opposite-side castling race failure | 700–2200 | Loses tempi or opens the wrong files in mutual attacks. |
| **AT-19** | Same-side pawn-storm self-exposure | 500–1850 | Advances king-cover pawns without sufficient justification. |
| **AT-20** | Central-counterstrike blindness | 850–2300 | Continues wing play while a central break is decisive. |

---

# M. Defensive play

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **DF-01** | Actual-threat identification failure | 300–1700 | Cannot state what the opponent will do next. |
| **DF-02** | Phantom-threat overreaction | 400–1800 | Makes concessions against an unsound or nonexistent threat. |
| **DF-03** | Passive-default defense | 500–2000 | Chooses only retreating or guarding moves without testing activity. |
| **DF-04** | Active-defense generation failure | 700–2250 | Misses counterchecks, counterattacks, exchanges, or tactical defenses. |
| **DF-05** | Attacker-exchange failure | 500–1800 | Does not consider removing the strongest attacking piece. |
| **DF-06** | Defender-reinforcement failure | 400–1600 | Fails to add a defender when the target can be held. |
| **DF-07** | Target-evacuation failure | 400–1650 | Adds defenders to a target that should move. |
| **DF-08** | Defensive-line-closing failure | 600–2000 | Does not consider blocking a rank, file, or diagonal. |
| **DF-09** | King-flight-square creation failure | 400–1600 | Misses a safe luft or escape-square move. |
| **DF-10** | Material-return aversion | 650–2100 | Tries to retain material when returning some ends the attack. |
| **DF-11** | Counterplay-generation failure | 700–2250 | Answers every threat directly instead of creating problems. |
| **DF-12** | Defensive only-move search failure | 950–2450 | Does not enter rigorous resource-search mode when required. |
| **DF-13** | Defensive-simplification misjudgment | 650–2150 | Trades into a lost ending or avoids a neutralizing exchange. |
| **DF-14** | Automatic queen-trade reflex | 500–1900 | Assumes a queen exchange is always desirable when defending. |
| **DF-15** | King-relocation blindness | 850–2200 | Defends the current king location when moving it is safest. |
| **DF-16** | Multiple-threat triage failure | 600–2050 | Cannot identify which threat must be answered. |
| **DF-17** | Post-error collapse | 200–2200 | One error is followed by unusually rapid deterioration. |
| **DF-18** | Practical-resistance failure | 950–2500 | Chooses passive losing lines instead of difficult human problems. |

---

# N. Advantage conversion

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **CV-01** | Forced-win rushing | 500–1800 | Searches for immediate tactics when simple improvement preserves the edge. |
| **CV-02** | Counterplay-suppression failure | 700–2250 | Does not remove the opponent’s only active resource. |
| **CV-03** | Wrong-liquidation failure | 700–2300 | Exchanges into an ending that reduces or removes the advantage. |
| **CV-04** | “Trade pieces, not pawns” misuse | 500–1900 | Applies a conversion rule without evaluating the result. |
| **CV-05** | Active-piece neutralization failure | 800–2200 | Allows one enemy piece to maintain counterplay. |
| **CV-06** | Winning-side king-activation failure | 500–1800 | Leaves the king passive after major danger has passed. |
| **CV-07** | Passed-pawn creation failure | 600–1900 | Does not convert an edge into a passer. |
| **CV-08** | Extra-pawn conversion technique | 600–2100 | Fails specifically in technically favorable one-pawn-up positions. |
| **CV-09** | Extra-exchange conversion technique | 850–2250 | Mismanages rook versus minor piece or pawn exchanges. |
| **CV-10** | Extra-piece conversion technique | 400–1700 | Allows forks, perpetuals, or excessive pawn liquidation. |
| **CV-11** | Winning-position clock misuse | 500–2250 | Plays too quickly or seeks unnecessary perfection. |
| **CV-12** | Winning-position overconfidence | 400–2200 | Threat checks and calculation quality decline while ahead. |
| **CV-13** | Winning-position fear/passivity | 650–2300 | Stops active play and permits counterplay. |
| **CV-14** | Advantage-reevaluation failure | 900–2450 | Continues as if the original advantage still exists. |
| **CV-15** | Two-weakness conversion failure | 1200–2500 | Cannot create or alternate between two targets. |
| **CV-16** | Overwhelming-material simplification failure | 250–1200 | Fails to reduce tactical risk while retaining an elementary material win. |
| **CV-17** | Stalemate-safe conversion failure | 200–1000 | Conversion repeatedly permits or nearly permits stalemate. |

---

# O. Endgame glossary

Direct knowledge testing is acceptable for rare endgames. Use mirrored positions, changed pawn files, and tempo variations rather than one memorized diagram.

## Elementary and pawn endings

| ID | Atomic diagnosis | Primary CR prior |
|---|---|---:|
| **EG-01** | King-and-queen mate technique | 100–600 |
| **EG-02** | King-and-rook mate technique | 200–800 |
| **EG-03** | Two-bishop mate knowledge | 950–1900 |
| **EG-04** | Bishop-and-knight mate knowledge | 1400–2500 |
| **EG-05** | Insufficient-material recognition | 100–650 |
| **EG-06** | Endgame king-activation failure | 300–1200 |
| **EG-07** | Rule-of-the-square knowledge | 350–1000 |
| **EG-08** | Basic pawn-race calculation | 400–1300 |
| **EG-09** | Direct-opposition knowledge | 400–1100 |
| **EG-10** | Distant/diagonal opposition | 700–1650 |
| **EG-11** | Key-square knowledge | 450–1250 |
| **EG-12** | Rook-pawn exception knowledge | 500–1400 |
| **EG-13** | Shouldering technique | 700–1750 |
| **EG-14** | Triangulation knowledge | 750–1800 |
| **EG-15** | Reserve-tempo knowledge | 750–1850 |
| **EG-16** | Zugzwang recognition | 650–1900 |
| **EG-17** | Pawn-breakthrough recognition | 600–1700 |
| **EG-18** | Corresponding-squares knowledge | 1450–2500 |
| **EG-19** | Wrong-bishop rook-pawn knowledge | 550–1500 |
| **EG-20** | Outside-passed-pawn technique | 650–1850 |
| **EG-21** | Connected-passer calculation | 600–1900 |
| **EG-53** | Ladder-mate technique | 100–500 |
| **EG-54** | Stalemate-avoidance knowledge | 150–900 |

## Rook endings

| ID | Atomic diagnosis | Primary CR prior |
|---|---|---:|
| **EG-22** | Rook behind the passed pawn | 650–1750 |
| **EG-23** | Active-rook priority | 700–1950 |
| **EG-24** | King-cutoff technique | 800–2050 |
| **EG-25** | Checking-distance knowledge | 950–2200 |
| **EG-26** | Side-checking technique | 1050–2300 |
| **EG-27** | Lucena-position knowledge | 900–2050 |
| **EG-28** | Philidor-position knowledge | 850–2000 |
| **EG-29** | Short-side defense | 1150–2300 |
| **EG-30** | Vancura-position knowledge | 1650–2500 |
| **EG-31** | Frontal-defense knowledge | 1100–2250 |
| **EG-32** | Rook-ending king-shelter failure | 900–2200 |
| **EG-33** | Four-versus-three same-wing technique | 1450–2500 |
| **EG-34** | Extra-outside-pawn rook ending | 1250–2450 |
| **EG-35** | Rook-trade judgment failure | 850–2200 |

## Minor-piece endings

| ID | Atomic diagnosis | Primary CR prior |
|---|---|---:|
| **EG-36** | Opposite-colored-bishop technique | 750–2000 |
| **EG-37** | Same-colored-bishop technique | 850–2100 |
| **EG-38** | Bishop-versus-knight ending judgment | 850–2250 |
| **EG-39** | Knight-blockade technique | 750–2050 |
| **EG-40** | Knight-versus-rook-pawn knowledge | 850–2150 |
| **EG-41** | Bishop-on-both-wings technique | 950–2250 |
| **EG-42** | Good-knight-versus-bad-bishop technique | 1050–2300 |

## Queen and mixed endings

| ID | Atomic diagnosis | Primary CR prior |
|---|---|---:|
| **EG-43** | Queen-ending perpetual geometry | 950–2300 |
| **EG-44** | Queen-ending king-safety judgment | 1050–2450 |
| **EG-45** | Queen-trade transition judgment | 850–2250 |
| **EG-46** | Queen-versus-advanced-pawn technique | 950–2250 |
| **EG-47** | Exchange-ending technique | 950–2300 |
| **EG-48** | Rook-versus-minor-piece technique | 1150–2400 |
| **EG-49** | Queen-versus-rook technique | 1500–2500 |
| **EG-50** | Endgame-fortress recognition | 1350–2500 |
| **EG-51** | Fifty-move/tablebase-boundary awareness | 1800–2500 |
| **EG-52** | Endgame-entry decision failure | 850–2450 |

---

# P. Performance-state and decision-bias diagnostics

These are chess-performance descriptions, not medical or personality diagnoses. Engine moves alone are never sufficient. Require prospective self-report, matched contexts, or repeated behavioral effects.

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **PS-01** | Hope-chess decision pattern | 400–2300 | Suspects a reply but plays as if it will not occur. |
| **PS-02** | Attack tunnel vision | 400–2400 | Opponent threats disappear once an attack begins. |
| **PS-03** | Confirmation bias | 600–2500 | Searches for support while avoiding refutation. |
| **PS-04** | Sunk-cost plan persistence | 600–2500 | Continues a plan mainly because resources were already invested. |
| **PS-05** | Attack-pressure performance drop | 200–2500 | Speed rises and candidate breadth falls under king pressure. |
| **PS-06** | Post-blunder state degradation | 200–2500 | Error rate rises immediately after recognizing a mistake. |
| **PS-07** | Post-loss carryover | 200–2500 | Next-game performance drops beyond fatigue and opponent effects. |
| **PS-08** | Higher-rated-opponent effect | 400–2500 | Decision quality changes specifically against much stronger opposition. |
| **PS-09** | Lower-rated-opponent overconfidence | 300–2500 | Risk and speed rise without chess justification. |
| **PS-10** | Winning-position fear | 400–2500 | Choices become passive and clock use rises sharply while ahead. |
| **PS-11** | Quiet-position autopilot | 300–2500 | Errors cluster in equal, low-tactical-intensity positions. |
| **PS-12** | Loss-aversion trade avoidance | 600–2500 | Rejects favorable exchanges because surrendering material feels unsafe. |
| **PS-13** | Compulsive simplification | 400–2400 | Seeks exchanges regardless of the resulting position. |
| **PS-14** | Uncertainty-intolerance pattern | 600–2500 | Spends excessive time trying to prove noncritical decisions completely. |
| **PS-15** | Result-based evaluation bias | 400–2500 | Judges moves mainly by the game result. |
| **PS-16** | Emotion-linked premature resignation | 300–2300 | Resigns due to emotional collapse despite known resources. Use `PD-03` if the issue is objective position assessment. |
| **PS-17** | Instant-rematch tilt | 200–2400 | Immediate rematches after emotional losses show a repeatable decline. |

---

# Q. Learning and training-process diagnostics

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **LR-01** | Puzzle-cue dependence | 300–2200 | Solves when told a tactic exists but fails uncued mixed positions. |
| **LR-02** | Puzzle-guessing habit | 300–1800 | High speed accompanies weak justification and defensive calculation. |
| **LR-03** | Offensive-tactics-only imbalance | 350–2200 | Finds own combinations but misses opponent tactics. |
| **LR-04** | Defensive-tactics training gap | 450–2350 | Missed resources disproportionately involve defense, perpetuals, or only moves. |
| **LR-05** | Engine-first review dependence | 500–2500 | Cannot reconstruct thoughts because engine analysis came first. |
| **LR-06** | Error-attribution failure | 400–2500 | Labels every loss “tactics” or “opening” without a mechanism. |
| **LR-07** | Passive opening-memory practice | 500–2400 | Recognizes moves when shown but cannot retrieve them from positions. |
| **LR-08** | Repertoire overbreadth | 600–2400 | Similar positions receive too few repetitions for stable learning. |
| **LR-09** | Training-to-game mismatch | 400–2500 | Training topics do not match the highest-impact game failures. |
| **LR-10** | Missing spaced retrieval | 400–2400 | Previously learned material decays because it is not retested. |
| **LR-11** | Drill-to-game transfer failure | 400–2400 | Probe performance improves while game failure rate does not. |
| **LR-12** | Thinking-process nonadherence | 400–2500 | Can state the process but does not use it in games. |
| **LR-13** | Excessive consecutive-game volume | 200–2400 | Later-session decline continues while rated play continues. |
| **LR-14** | Inappropriate time-control dependence | 200–2300 | Chosen control prevents practice of the diagnosed thinking skill. |
| **LR-15** | Training-difficulty mismatch | 200–2500 | Exercises are automatic or too difficult to generate useful learning. |
| **LR-16** | Outcome-biased review | 400–2500 | Wins are barely reviewed while losses receive all attention. |
| **LR-17** | Premature focus switching | 400–2400 | Changes topic before transfer and retention are measured. |
| **LR-18** | Persistent nonresponse | 200–2500 | Adherent work produces no probe or game improvement, suggesting a wrong or upstream diagnosis. |

---

# R. Practical game-decision diagnostics

| ID | Atomic diagnosis | Primary CR prior | Diagnosis |
|---|---|---:|---|
| **PD-01** | Unjustified draw acceptance | 400–2400 | Accepts a draw in a position with meaningful winning chances without a conscious practical reason. |
| **PD-02** | Unjustified draw refusal | 400–2400 | Rejects a sound draw despite objective danger or match circumstances. |
| **PD-03** | Premature resignation judgment | 300–2300 | Resigns while significant objective or practical resources remain. |
| **PD-04** | Repetition-choice misjudgment | 600–2500 | Repeats or avoids repetition without correctly evaluating alternatives. |
| **PD-05** | Risk-selection mismatch | 800–2500 | Chooses a risk level inconsistent with the position and scoring situation. |
| **PD-06** | Complexity-selection mismatch | 900–2500 | Simplifies or complicates contrary to objective and practical needs. |

---

# III. History, scope, and severity

These should be separate axes. “Context-bound” is not a historical status.

## 1. Historical status

| Status | Definition |
|---|---|
| **Newly observed** | First adequate window in which the diagnosis meets threshold. |
| **Persistent** | Remains above threshold across at least two adequate windows. |
| **Improving** | Failure rate, severity, or latency is meaningfully declining. |
| **Monitoring** | Initial criterion is resolved, but durable transfer is unproven. |
| **Resolved** | Improvement survives delayed and varied retesting. |
| **Regressed** | A previously resolved diagnosis has returned. |
| **Nonresponsive** | Correctly followed work produces no meaningful change. |
| **Superseded** | A more accurate upstream diagnosis now explains the earlier symptom. |

## 2. Scope tags

- General
- Opening-bound
- Structure-bound
- Side/color-bound
- Game-phase-bound
- Time-control-bound
- Clock-bound
- Complexity-bound
- Opponent-strength-bound
- Session-bound
- Device/interface-bound
- Stress-sensitive

## 3. Severity

| Severity | Definition |
|---|---|
| **Minor** | Small practical loss or low-impact inaccuracy. |
| **Meaningful** | Material, initiative, or technical cost that affects winning chances. |
| **Major** | Large preventable WDL loss. |
| **Decisive** | Directly changes a likely win/draw/loss result. |

---

# IV. Choosing the next 1–2 week focus

Do not select the lowest percentage automatically.

A primary focus should maximize:

> **Confidence × preventable impact × recurrence × transfer breadth × trainability × measurement feasibility**

Apply these overrides:

1. **Prerequisite override:** Board model before complex calculation.
2. **Root-cause override:** One general process cause before several tactical symptoms.
3. **Human-reachability override:** Ignore engine-only improvements.
4. **Scope override:** The target must fit a focused cycle.
5. **Data-quality override:** No primary diagnosis may bypass a failed data gate.
6. **State override:** If fatigue, interface, or clock state explains most incidents, do not mislabel the chess concept.
7. **Curriculum-value override:** Rare theoretical knowledge should not displace a frequent game leak unless strategically important.

Reduce priority when:

- Opportunities are extremely rare.
- Evidence comes from one accidental game.
- The issue is already improving.
- The alternative move was unrealistic.
- A prerequisite is absent.
- Incidents were downstream consequences of another error.
- The issue has low transfer beyond one narrow position.
- A rating prior is the only supporting evidence.

Normally return:

- One primary diagnosis.
- No more than two secondary findings.
- At least one closely related intact control skill.
- Explicit differentials ruled out.

---

# V. Resolution criteria

A diagnosis does not need to disappear permanently in two weeks. It must show acquisition, retention, and appropriate transfer.

## Common game-leak criterion

1. **Blinded probe:** At least 80% on new mixed positions, or above a calibrated mastery threshold.
2. **Mechanism test:** Correct process or explanation without prompting.
3. **Game transfer:** Clear reduction in opportunity-adjusted failures, with no repeated severe episode in the next adequate set of opportunities.
4. **Spread:** Improvement appears in multiple sessions or openings.
5. **Stress test:** Skill survives moderate time pressure or complexity.
6. **Delayed retention:** Improvement remains after at least one later retest.

## Rare knowledge criterion

For rare endgames, rules, or opening branches:

1. Two varied test forms.
2. Mirrored or tempo-modified positions.
3. Delayed retrieval.
4. Correct explanation or execution without recognition cues.

Do not require game transfer when realistic game opportunities are absent. Mark the finding **Monitoring: curriculum-only**.

## State-conditioned criterion

Compare matched situations before and after:

- Similar clock range.
- Similar position complexity.
- Similar session point.
- Similar opponent difference.

A simple decline in total blunders is not enough if the proposed state effect remains unchanged.

If probes improve but games do not, investigate `LR-11`, `LR-12`, `MS-12`, or another transfer/process mechanism. If neither improves, the original diagnosis was likely wrong, too broad, or downstream of a prerequisite.

---

# VI. Required output to John

## Example 1: beginner/intermediate tactical diagnosis

> **Primary diagnosis:** `TA-07.R.D — Defensive knight-fork recognition failure`  
> **Primary CR prior:** 300–1200  
> **Student:** 920 Chess.com Rapid, established account  
> **Control:** 15+10  
> **Context:** After exchanges with several loose pieces  
> **History:** Persistent  
> **Scope:** Context-bound; not clock-bound  
> **Game evidence:** Failed 6 of 9 realistic defensive knight-fork opportunities across five games and three sessions. Four caused major hWDL loss.  
> **Probe evidence:** Correct knight geometry and 90% on named-fork positions, but only 2 of 8 on uncued mixed positions.  
> **Mechanism:** Recognition, not knowledge, geometry, or calculation.  
> **Clock evidence:** Move times were normal for position complexity.  
> **Differentials ruled out:** `BV-06`, `TA-06.K`, `TM-01`, and general time trouble.  
> **Intact control:** Offensive knight-fork recognition was adequate.  
> **Confidence:** Confirmed  
> **Why primary:** Frequent, severe, trainable, and more foundational than the student’s current opening inaccuracies.

## Example 2: low-rating rules diagnosis

> **Primary diagnosis:** `RB-01.K.N — Pawn movement-versus-capture knowledge gap`  
> **Primary CR prior:** 100–250  
> **Student:** 180 Chess.com Rapid, provisional  
> **Evidence source:** Direct board probe; online games were not used because legality highlighting masked the issue.  
> **Probe evidence:** Incorrect on 7 of 10 varied pawn-movement positions and remained incorrect after the distinction was named.  
> **Differentials ruled out:** Board orientation and verbal-language confusion.  
> **Confidence:** Confirmed curriculum finding  
> **Data warning:** Rating comparison is unreliable because the account is provisional.

## Example 3: advanced diagnosis

> **Primary diagnosis:** `ST-33.G.N — Second-order prophylactic candidate-generation failure`  
> **Primary CR prior:** 1800–2500  
> **Student:** 2240 Chess.com Rapid  
> **Context:** Quiet, high-tension middlegames against stronger opposition  
> **History:** Persistent  
> **Scope:** Opponent-strength-bound and complexity-bound  
> **Evidence:** Student identifies the opponent’s immediate plan but does not generate candidates addressing the opponent’s best follow-up after that plan is prevented. The pattern produced repeated slow hWDL losses rather than tactical cliffs.  
> **Differentials ruled out:** Calculation depth, structure knowledge, and time pressure.  
> **Intact control:** First-order prophylaxis was strong.  
> **Confidence:** Probable-to-high.

This is the required level of granularity: one trainable object, one mechanism, a defined direction and context, adequate evidence, an appropriate rating prior, and explicit alternative explanations ruled out.