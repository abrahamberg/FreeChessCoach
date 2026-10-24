# FreeChess Coach on YouTube: why the channel is not growing, and the plan

Written 2026-10-24, eleven days after the first upload. A marketing
diagnosis, not a code plan: the *why* and the *what* first, the *how* last.
Numbers come from the owner's YouTube Studio summary (2026-10-24), the
channel's public feed, the live courses at freechesscoach.org, and the
content studio's instructions and logs (`chess-content-studio`, pushed
2026-10-15).

## 1. The short version

The channel has a reach problem that is not a reach problem. Four thousand
Shorts views in eleven days is a normal start. What is broken is everything
that turns a view into a subscriber and a subscriber into a user:

1. **No one knows who the channel is for or who is talking.** Three
   audiences (people who have never played, 1000-rated trap hunters,
   people who want an AI coach) and nine different hosts in sixteen
   uploads. A subscription is a bet on the next video; with no consistent
   promise the bet is never placed. 1,500 unique viewers, 3 subscribers.
2. **The long video is the course, filmed.** Eight minutes of speech, up
   to ten chapter cards, every defence. Browse viewers want one story with
   one payoff. Average view duration of 1:25 on 6–8 minute videos is about
   20% retention; YouTube stops recommending at that level.
3. **The packaging is a rendered slide, not a thumbnail.** Nine long
   videos use one identical layout: a full 32-piece board, the site name,
   three lines of mid-sized text, a small portrait. At phone size nothing
   reads. 10,494 impressions, 1.18% click-through. YouTube showed the
   videos to ten thousand people and 124 clicked.
4. **Publishing has no quality gate.** A long video titled "#shorts". A
   Short whose title is its file name ("punish the halloween gambit
   reel"). A long video whose description is two alternative title drafts
   in quotes. Short descriptions with an empty "Full lesson:" placeholder.
   Three videos uploaded within thirty minutes, twice. One upload at 02:00.
   Chapters promised in every description, added to none. No link carries
   a source tag, so the site cannot tell a YouTube visitor from anyone else.
5. **The goal is the wrong shape.** "1,000,000 views by 2028" is a vanity
   number: one lucky Short could hit it and make nothing. A million chess
   views earns a few hundred to a few thousand dollars in ads. The money is
   in the app (members' courses are already built; a hosted-AI tier is the
   obvious second product). The channel's job is to fill that funnel, and
   today the funnel is not even measured.

The plan: one viewer, one host, two named formats, a thumbnail system, a
publishing checklist, an instrumented funnel, and a monetization roadmap
with gates. Section 6 has the fixes to make this week, including rewrites
of all fifteen live titles.

## 2. What the numbers say

| Metric | Shorts | Long videos | Reading |
|---|---|---|---|
| Views (11 days) | 4,025 (93%) | 292 (7%) | Normal for a new channel: Shorts reach strangers, long videos reach subscribers, and there are three. |
| Impressions | 566 | 10,494 | YouTube *did* test the long videos. The test failed on the click. |
| Click-through | 2.8% | 1.18% | YouTube's own help text puts half of all channels between 2% and 10%. Under 2%, browse traffic dries up. |
| Average view duration | 28 s | 1 m 25 s | Shorts of 45–55 s: about 55% watched. Long videos of 6–8 min: about 20%. |
| Subscribers | 3 from ~1,500 unique viewers | | 0.2%. A channel with a clear promise converts 1–3% of unique viewers early on. |

Per video (public counts as of 2026-10-24, which lag Studio):

| Posted | Type | Title as posted | Views |
|---|---|---|---|
| 10-15 | Short | Stafford Gambit trap: would you trust this pin? #shorts #chess #gambit #trap | 1,077 |
| 10-15 | Long | Stafford Gambit Trap: The Bg5 Pin That Loses | 24 |
| 10-15 | Long | Legal's Mate: Sacrifice Your Queen to Win The Game **#shorts** | 14 |
| 10-15 | Short | Legal's Mate: he took the queen... #Shorts #chess #trap #gambit #chesstraps | 1,211 |
| 10-15 | Long | Stop Scholar's Mate and Win the Queen, Scholar's Mate Defense That Wins Material | 60 |
| 10-15 | Short | Scholar's Mate attacker? Do this. #Shorts #chess #chesstraps #trap | 267 |
| 10-16 | Long | Chess Board and How to Win: Checkmate for Beginners | 21 |
| 10-16 | Long | How the Rook, Bishop and Queen Move in Chess | 13 |
| 10-16 | Long | How the Knight and the King Move in Chess | 6 |
| 10-18 | Long | Fried Liver Attack: he hunts your queen and gets mated #chess #trap | 61 |
| 10-18 | Short | Fried Liver Attack: the queen mate on f7 #shorts | 60 |
| 10-19 | Short | Englund Gambit: don't chase this queen with your bishop #Short | 30 |
| 10-19 | Long | Englund Gambit: How to Punish It as White | 88 |
| 10-20 | Long | Halloween Gambit: How to Punish It as Black | 2 |
| 10-20 | Short | punish the halloween gambit reel | 76 |

Three things in this table decide the plan:

- **The two Shorts that broke out share one hook.** "Would you trust this
  pin?" and "he took the queen..." both open on a *free queen* and a
  *question*, and withhold the outcome. The four that flopped either spoil
  the ending in the title ("the queen mate on f7"), scold the viewer
  ("don't chase this queen with your bishop"), or are a label ("punish the
  halloween gambit reel"). That is a 15–40× gap from the hook alone, on
  the same production quality. The format already exists; it has to be
  named and repeated.
- **The beginner series is invisible on YouTube.** 6, 13 and 21 views.
  Someone who does not know how the rook moves is not browsing YouTube for
  "How the Rook, Bishop and Queen Move"; that query is owned by Chess.com
  and a 13-million-view guide. These are good *site* courses (they anchor
  the Chess From Zero series and up-next flow) and poor YouTube slots.
- **The best title the channel has was never used.** The Stafford course's
  own video title is "Stafford Gambit Trap: Let Them Take Your Queen"; the
  upload went out as "The Bg5 Pin That Loses". The studio wrote the better
  line and posted the worse one.

## 3. Why: the strategic errors behind the numbers

### 3.1 "The video is the ad, the course is the product"

This doctrine (`docs/courses.md` §13.1, the studio's `CLAUDE.md`) is right
about the business and wrong about YouTube. YouTube ranks a video by how
much it keeps people *on YouTube*: watch time, session time, return
visits. A video built as a trailer for an off-platform course, ending with
"the rest is on our site", does the opposite twice: the viewer learns the
video is a teaser, and YouTube learns the channel exports sessions.

The resolution is not to hide the course. It is to give the two products
different jobs:

- **The video is complete.** The viewer leaves knowing the trap, the bait,
  the punishment and the two defences they will actually meet. Nothing
  withheld.
- **The course is where you *practise* it.** "Play it move by move,
  against every escape, until your hands know it." Practice is a
  different promise from teaching, so it is not a teaser; it is the next
  step a motivated viewer wants.
- **The next video keeps them on YouTube.** The end screen points to the
  next trap, not only to the site.

### 3.2 Nine hosts, no face

People subscribe to a character or a reliable series, not to a topic. The
nine coach personas are a strength of the app (the user chooses) and a
weakness of a two-week-old channel (the viewer is chosen for, differently
each time). The studio deliberately varies the coach per video "as a thing
to measure"; with 1–3 videos per coach nothing can be measured, and the
cost is identity.

### 3.3 Three audiences

| Audience | What they search | Do they convert to the app? |
|---|---|---|
| Never played | "how the knight moves" | Rarely: no games to import, no key, no habit. |
| 700–1400 online player | "Stafford Gambit trap", "how to punish Scholar's Mate" | Yes: they have a Lichess/Chess.com history, lose to tricks, want to climb. |
| Wants an AI coach | "AI chess coach" | Yes, but tiny volume and reached better by the site than by Shorts. |

The second row is both the audience the trap content already reaches and
the app's real user. The channel should be built for them alone.

### 3.4 A course document is not a video script

The trap courses carry about 1,100 spoken words for the video (≈8 minutes
at speaking pace, before pauses, chapter cards and the quiz countdown),
with 27–29 narrated moves and 5–10 chapters. The Stafford recording was
5:50 with 28 narrated moves. Every chapter card costs a whoosh plus the
coach reading the title. Every defence episode is a new story the browse
viewer did not sign up for. The *course* needs all of it. The *video*
needs the trap, the bait, the punishment, the two most common human
defences, and the practice link. Four to six minutes.

The hook is also long: 36–40 words over a title slide whose elements slide
in one after another. The first three seconds decide the view; the first
word should land on frame one, over the climax board, with nothing
animating in beside it.

### 3.5 The call to action asks for the wrong thing in the wrong place

- Long videos: the subscribe ask is 65–86 words at the very end, where
  under a fifth of viewers remain, and it is generic ("like and subscribe,
  because that is what keeps these lessons coming").
- Shorts: "Follow for the free course" asks for a YouTube follow in
  exchange for something not on YouTube. On Shorts the signals that
  matter are watched-to-the-end, rewatch and comments. A question that
  people answer in the comments ("Would you have taken it?") does more
  than a follow ask.

### 3.6 The money is not in the views

At chess-niche ad rates, a million views split like today's (93% Shorts)
is worth low hundreds of dollars; even a million long-form views is low
thousands. The app already has the two things that make money for a
creator-educator: a product people value (the coach, the courses) and a
gate (members-only courses by access level, shipped). What it lacks is the
funnel and its measurement. "Become a money generator" means the channel's
north star must be **course opens and sign-ins from YouTube**, with views
as a leading indicator, and a membership launched once the funnel proves
itself (Section 5).

## 4. The plan: what the channel becomes

### 4.1 Positioning

> **FreeChess Coach:** where players under 1500 learn to spring the traps
> and punish the gambits they keep losing to. Every line engine-checked.
> Every lesson playable move by move, free.

One viewer: the 700–1400 online player. One tone: sharp, confident, a
little predatory, never a lecture.

### 4.2 Decisions

1. **One host on YouTube: The Huntress.** She already fronts three of the
   five trap courses and the best-performing Short; "hunt / prey / stalk"
   gives the series its language. The other coaches stay in the app and on
   the site's beginner series. Revisit after 20 videos, not before.
2. **Chess From Zero stays on the site, off the YouTube calendar.** Keep
   the three uploaded lessons public in a playlist (long-tail search), post
   no more of them, spend every slot on the one viewer.
3. **Two named formats, nothing else for 60 days,** plus one experiment in
   five (a puzzle Short, a master-game Short, a "guess the rating" when the
   app can make it).

| Format | Series name on screen | Job | Cadence |
|---|---|---|---|
| Short | **Free queen?** (a bait, a question, the punishment) | Reach and comments | Daily, fixed hour |
| Long | **Punish the \<gambit\>** (one trap, two real defences) | Subscribers and course opens | Tuesday and Friday, fixed hour |

4. **The video is complete; the course is practice.** The spoken line at
   the end changes from "this whole lesson is a free course" to "play it
   against every escape at freechesscoach.org/learn/…, free, until your
   hands know it".
5. **The subscribe ask moves to the first payoff** (about a third in,
   right after the mate or the won queen), is one sentence, and is a
   promise with a schedule: *"Every Tuesday and Friday: one trap players
   under 1500 fall for, engine-checked. Subscribe so you are the one
   springing it."* The outro is twelve seconds: the question for the
   comments, the next trap on the end screen, the practice link.
6. **North star metrics** replace the view goal: course opens from
   YouTube per week, sign-ins from YouTube per week, and later members.
   Views, click-through and retention are the dials that move them.

### 4.3 The Short, rebuilt

The breakout hook, made a rule:

- **Frame one:** the bait position and the question on the top band,
  before any move: "Free queen. Take it?" / "Would you take this?"
- **Spoken first sentence** names the opening and the stake in under
  eight words: "Stafford Gambit. White just took my queen."
- **Build-up ≤ 8 seconds.** The reel timeline today plays build-up from
  second 3 to second 20 at 650 ms a move; most of the swipe-away happens
  there. Moves before the bait at 350–400 ms, the bait held, the
  punishment slowed.
- **Climax by second 12–15. Total 25–40 seconds.** Short enough to loop.
- **No spoilers in the title or the top band.** "The queen mate on f7"
  told the viewer the ending before they pressed play.
- **The call to action is a question, not a follow:** "Would you have
  taken it? Yes or no, below." The course link lives in the description
  and the pinned comment; the **Related video** field (YouTube Studio)
  points to the long video, every time.
- **Title:** a question or a stake in plain words, the opening in
  brackets, no hashtags: *"Would you take this free queen? (Stafford
  Gambit)"*.

### 4.4 The long video, rebuilt

- **Cold open ≤ 8 seconds, ≤ 20 words,** first word on frame one over the
  climax board. Title text may appear *after* the sentence lands; nothing
  slides in during it.
- **Structure:** the trap played straight through (90 s) → "here is why
  the bait looks right" (60 s) → the two defences a human actually plays
  (2 × 60 s) → the subscribe promise → the practice link and the next
  trap. Four to six minutes.
- **Chapter cards become one-second labels** on the board (no whoosh, no
  read-aloud), or go. Chapters live in the description instead, where they
  earn key moments in Google search.
- **Rare defences and sidelines go to the course only**, and the video
  says so in one line: "White has three other ways to run; the course
  drills all of them."
- **Title:** the search phrase first, the twist second, ≤ 55 characters,
  no hashtags, never a file name. *"Legal's Mate: Hang Your Queen, Mate in
  Two"*.
- **Description:** line one repeats the search phrase and the stake; line
  two the practice link with a source tag; then chapters; then the next
  trap's link; at most three hashtags at the end.

### 4.5 The thumbnail system

Today's thumbnail is the video's title slide: correct for a slide, wrong
for a 168-pixel rectangle competing with faces and red arrows. Rules:

1. **One face, big, with an emotion.** The coach portrait fills at least
   40% of the height on one side. Each coach needs three or four
   expression variants (shocked, smug, pointing, "oh no"); one neutral
   portrait cannot carry a channel.
2. **A cropped board, not the whole board.** A 4×4 or 5×5 window around
   the critical square, at most six pieces, one red or yellow arrow or X,
   the key piece outlined. Thirty-two pieces at phone size is texture.
3. **At most three words,** cap height ≥ 160 px at 1280 wide, yellow or
   white on dark, with a stroke. *TAKE MY QUEEN?* works; *Punish the
   Englund Gambit: hunt the greedy queen* does not.
4. **No URL, no logo, no site name.** The channel name sits under every
   title already; those pixels belong to the face and the arrow.
5. **Vary the composition within one look.** A series needs a recognizable
   family, not nine identical rectangles: alternate face left / face
   right, board tilt, background colour per series.
6. **Two variants per upload** through YouTube's own *Test & compare*.
   Target: ≥ 4% click-through in browse within 30 days; a video under 2%
   after 1,000 impressions gets a new thumbnail and title within 48 hours.

### 4.6 Publishing hygiene (the gate)

Nothing is uploaded until this list is ticked, by a second pass that did
not write the text:

- Title ≤ 55 characters, search phrase first, no hashtags, not a file name,
  not a draft note; Shorts titles are a question or a stake.
- Description: first line keyword + stake; practice link with a source
  tag; long videos have chapters (0:00 first); Shorts link the long video
  and have the Related video set; ≤ 3 hashtags at the end.
- Thumbnail uploaded (not the auto frame), two variants in test.
- End screen: next trap + the course link. Pinned comment: the question
  and the link.
- One upload per slot. Shorts daily at the fixed hour; long videos Tuesday
  and Friday at the fixed hour (17:00 CET reaches the US morning and the
  European evening). Never three uploads in one half hour: they split the
  impressions test and look like a dump.
- The coach on screen is the channel's host.

### 4.7 Measurement

- Every link out of a video carries
  `?utm_source=youtube&utm_medium=short|video&utm_campaign=<slug>`
  (TikTok and Instagram: their own `utm_source`). The site counts course
  opens by source; the public pages today carry no analytics tag that I
  could find and no link carries a tag, so none of the 4,300 views can be
  tied to a visit.
- Per video, weekly, in the studio's state: impressions, click-through,
  average percentage viewed, Shorts "viewed vs swiped away", subscribers
  gained, end-screen clicks, course opens.
- Decision rules, applied on medians over at least five videos per format:
  click-through < 2% after 1,000 impressions → repackage within 48 hours;
  average percentage viewed < 30% → restructure the next video of that
  format; a Short over 5× the median → the long video of that course next
  and a second Short from another moment of it.

## 5. Money: the roadmap and its gates

Keep "free, forever, with your own key" as the brand. Monetization is
convenience and depth on top of it, never a gate on what is free today.

| Stage | Gate | What earns |
|---|---|---|
| 0. Now | — | Nothing visible. Instrument the funnel (4.7). Fix the fifteen live uploads (6.1). |
| 1. Partner Program | 1,000 subscribers and 4,000 public watch hours in 12 months (or 10M Shorts views in 90 days) | Ads on long videos. Small money; mainly a credibility marker and a reason viewers trust the channel is real. |
| 2. Members | ~500 course opens a month from YouTube, or ~200 active app users | **Membership in the app** (the access-level gate already shipped): a members' series ("Beat every gambit under 1500"), and **the coach with no setup** (a hosted key, no OpenAI account), at about $5 a month with a founding price. Sold as "the free coach, without the setup", announced on the channel. This is where a creator-educator's revenue actually comes from. |
| 3. Scale | 10,000+ subscribers | Sponsorship (chess-adjacent, never a competing coach), a repertoire bundle, licensing the course engine. |

Two honest notes:

- **Bring-your-own-key is the funnel's biggest leak.** A 1000-rated viewer
  who clicks "free coach" and meets "create an OpenAI account and paste a
  key" leaves. Everything that needs no key (courses, Game Review, stats,
  bots) should be the landing experience; the coach with a hosted key is
  the paid convenience in stage 2. This is an app decision, but it decides
  whether the channel's traffic ever becomes money.
- **Realistic size.** Two years of good execution in this niche is a
  channel of some tens of thousands of subscribers and some hundreds of
  members. That is a real income; ad revenue alone is not. Score every
  channel decision on course opens and sign-ins.

## 6. How: this week, this month, this quarter

### 6.1 This week: fix what is live (two hours, highest return available)

Rename, re-describe, re-thumbnail and re-link all fifteen uploads. Proposed
titles (≤ 55 characters, no hashtags):

| Video | Now | Proposed |
|---|---|---|
| Stafford long | Stafford Gambit Trap: The Bg5 Pin That Loses | **Stafford Gambit Trap: Let Them Take Your Queen** (the course's own title) |
| Legal's long | Legal's Mate: Sacrifice Your Queen to Win The Game #shorts | **Legal's Mate: Hang Your Queen, Mate in Two** |
| Scholar's long | Stop Scholar's Mate and Win the Queen, Scholar's Mate Defense That Wins Material | **Punish Scholar's Mate: Their Queen Becomes Prey** |
| Fried Liver long | Fried Liver Attack: he hunts your queen and gets mated #chess #trap | **Fried Liver Attack: They Hunt Your Queen, Get Mated** |
| Englund long | Englund Gambit: How to Punish It as White | **Punish the Englund Gambit: Hunt the Greedy Queen** |
| Halloween long | Halloween Gambit: How to Punish It as Black (description is two title drafts) | **Halloween Gambit: Take the Knight, Break the Curse**, and a real description |
| Stafford Short | Stafford Gambit trap: would you trust this pin? #shorts #chess #gambit #trap | **Would you take this free queen? (Stafford Gambit)** |
| Legal's Short | Legal's Mate: he took the queen... #Shorts #chess #trap #gambit #chesstraps | **He took the queen. Mate in two. (Legal's Mate)** |
| Scholar's Short | Scholar's Mate attacker? Do this. #Shorts #chess #chesstraps #trap | **Scholar's Mate? Their queen is your prey** |
| Fried Liver Short | Fried Liver Attack: the queen mate on f7 #shorts | **They hunted my queen in the Fried Liver. Then this.** |
| Englund Short | Englund Gambit: don't chase this queen with your bishop #Short | **Her queen takes b2. One wrong recapture and you're mated** |
| Halloween Short | punish the halloween gambit reel | **A free knight on move 4? Halloween Gambit** |
| Chess From Zero ×3 | (as is) | Leave; group in a "Chess From Zero" playlist; no more YouTube slots. |

Also this week:

- Set **Related video** on every Short to its long video; fill the empty
  "Full lesson:" lines; add chapters to every long video; add end screens;
  pin a comment with the question and the practice link on each.
- Add the source tag to every link; add course-page counting by source.
- Fill `clipLinks` on the ten live courses so the course pages embed the
  videos (watch time from site visitors, and the loop closes).
- **Halloween Gambit, now.** The search spike is 25–31 October. Fix its
  packaging today and post a second Short from it on the 28th–30th:
  *"Free knight on Halloween? It's a trap."*
- Create playlists: *Punish the gambit*, *Free queen? (Shorts)*, *Chess
  From Zero*.

### 6.2 This month

- Re-record the five trap long videos under the new structure (4.4) with
  The Huntress, new thumbnails (two variants each), the subscribe promise
  at the first payoff.
- Daily *Free queen?* Short at the fixed hour from the existing courses
  (each trap course has three to five bait moments; the studio's `@reel`
  mark picks them), then the backlog: Tennison, Fishing Pole, Noah's Ark,
  Ponziani trap, Vienna trap, Blackburne Shilling, Elephant Gambit, the
  Stafford's h-pawn attack.
- Engagement block as the studio's playbook already says: reply to every
  comment the same day; eight specific comments a day on small and
  mid-size trap channels; no links.
- Weekly numbers review against the decision rules (4.7).

### 6.3 This quarter (targets, not forecasts)

| By | Target |
|---|---|
| 30 days | Long-video click-through ≥ 4%, average viewed ≥ 40%; Shorts average viewed ≥ 75%; 100 subscribers; funnel instrumented; all live uploads repackaged. |
| 60 days | 300 subscribers; two Shorts past 10,000; ≥ 500 course opens a month from YouTube. |
| 90 days | 1,000 subscribers (Partner Program); a long video's 7-day median ≥ 500 views; Members launch decision on the funnel data. |

## 7. What the app and the studio need to change

For the owner (app):

1. **A thumbnail tool, separate from the title slide**: climax board
   cropped to the critical window, ≤ 6 pieces, one arrow, ≤ 3 words,
   portrait variant, two outputs per course. The title slide can stay as
   the video's first frame.
2. **Reel timeline**: build-up ≤ 8 s (`fastMoveMs` for every move before
   the bait), question on the top band from frame one, climax by 12–15 s,
   target 25–40 s. The CTA field becomes a comment prompt; the "follow"
   wording goes.
3. **Video timeline**: hook text visible only after the spoken hook; no
   slide-in during it; chapter cards optional and silent; a `videoLite`
   tick so a course can mark the two defences the video keeps.
4. **Source tags** on every generated link; a course-open counter by
   source on the public course route.
5. **Portrait variants** per coach (three or four expressions).
6. **The landing experience with no key**: courses, review, stats and
   bots first; the coach's key setup as the step after a visitor has seen
   value.

For the studio (`CLAUDE.md`, ready to paste):

```
## The channel's viewer and voice (owner, 2026-10-24)
One viewer: the 700–1400 online player who loses to traps and gambits.
One host on YouTube: The Huntress. Other coaches appear in the app and on
the site's beginner series only. Chess From Zero is not posted to YouTube.
Two formats: "Free queen?" Shorts (daily, fixed hour) and "Punish the
<gambit>" long videos (Tuesday and Friday, fixed hour). One slot in five
is an experiment.

## The Short formula
Frame one shows the bait position and the question on the top band. The
first sentence names the opening and the stake in under eight words.
Build-up at most 8 seconds; climax by second 15; total 25–40 seconds. The
title is a question or a stake, no spoiler, no hashtags, no file names.
The CTA is a question for the comments; the course link goes in the
description and the pinned comment; Related video points to the long video.

## The long video
Complete on YouTube: the trap, the bait, the punishment, the two most
common human defences. Rare lines are the course's. Cold open at most 20
words. The subscribe promise comes at the first payoff, one sentence,
with the schedule. Outro at most 12 seconds: the question, the next trap,
the practice link ("play it against every escape, free").

## Before any upload (second pass, not the writer)
Title ≤ 55 chars, search phrase first, no hashtags, not a file name.
Description: keyword + stake, tagged link, chapters (long), long-video
link + Related video (Short), ≤ 3 hashtags. Custom thumbnail, two
variants in test. End screen. Pinned comment. One upload per slot at the
fixed hour. Coach = The Huntress.

## Measure, weekly, per video
impressions, CTR, average % viewed, swipe-away %, subs gained,
end-screen clicks, course opens (by utm_campaign). Rules on medians of
5+ per format: CTR < 2% after 1,000 impressions → repackage in 48 h;
% viewed < 30% → restructure the format; Short > 5× median → its long
video next and a second Short.

## North star
Course opens and sign-ins from YouTube per week. Views are a dial.
```

## 8. What this plan does not do

- It does not promise numbers. The 30/60/90 targets are what a channel
  that fixes packaging and retention typically reaches; the only
  guarantee is that the current packaging will not.
- It does not touch TikTok or Instagram beyond "same Short, same formula,
  link in bio". YouTube is where the subscribers and the course opens are.
- It does not change the free-with-your-own-key promise. Everything free
  today stays free; membership adds convenience and depth.
