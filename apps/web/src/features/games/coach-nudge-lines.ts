import type { CoachNudgeKind, CoachPersona } from '@freechesscoach/shared';

/** What the coach says in the Games page's coach area (CoachNudgeCard), in
 * each coach's own voice. The advice is the same for every coach — only the
 * framing changes (coaches.md, and the onboarding lines in
 * onboarding/coach-lines.ts).
 *
 * The first-time situations (import_first, first_coaching, first_play) happen
 * once, while the student is still learning how the app works, so each coach
 * has one line for them that says so. Every other situation repeats, so each
 * coach has a few alternatives, picked at random. */

type FirstTimeKind = 'import_first' | 'first_coaching' | 'first_play';

/** 'idle' splits into four things the coach might say when nothing is due. */
export const IDLE_TOPICS = ['analyze', 'bots', 'encourage', 'rest'] as const;
export type IdleTopic = (typeof IDLE_TOPICS)[number];

type RepeatingKey = 'picked_game' | 'practice' | 'import_more' | 'coach_game' | 'play_coach' | `idle_${IdleTopic}`;

interface PersonaNudgeLines {
  /** `remaining` is how many more games pattern tracking still needs. */
  import_first: (remaining: number) => string;
  first_coaching: string;
  first_play: string;
  repeating: Record<RepeatingKey, readonly string[]>;
}

const games = (count: number) => `${count} more ${count === 1 ? 'game' : 'games'}`;

const CLASSIC_MALE: PersonaNudgeLines = {
  import_first: (remaining) =>
    `Let’s start with the basics of how this works: I learn your play from your own games. Import ${games(remaining)}, rated and with one time control, and I can start spotting the patterns that repeat.`,
  first_coaching:
    'Here is how a coaching session works: we go through one of your games together, and I ask before I tell. I picked this one for our first session.',
  first_play:
    'There is one more way to work with me: play a game against me, and I talk you through it as it happens. Shall we try one?',
  repeating: {
    picked_game: [
      'I went through the games you just imported and picked this one for you. It has the most to teach us.',
      'Of these games, this is the one I would coach you on. It has the clearest lessons.',
      'I picked this one for you. Its tactical moments are where we should start.'
    ],
    practice: [
      'Your practice set is ready. Let’s do that first, before anything else.',
      'Before anything else, the practice I set for you. It targets exactly what we found.',
      'Practice first today. That set was built from your own mistakes.'
    ],
    import_more: [
      'No new games for a few days. Play some 10-minute rapid games on Lichess or Chess.com against real people, then import them so I can keep helping you improve.',
      'I have nothing new to look at. A few 10-minute rapid games on Lichess or Chess.com, imported here, give us fresh material.',
      'Time for new games. Play 10-minute rapid on Lichess or Chess.com against people, then bring them here.'
    ],
    coach_game: [
      'It has been a few days since we coached a game. Let’s go through this one together.',
      'This game is waiting for us. Shall we look at it together?',
      'Let’s coach you on this game. I think there is something useful in it.'
    ],
    play_coach: [
      'We haven’t played together in a while. Let’s play a game, and I’ll coach you as we go.',
      'How about a game against me? I’ll talk you through it move by move.',
      'Let’s play one together. It is the quickest way to practise thinking out loud.'
    ],
    idle_analyze: [
      'You can always go through a game on your own. The review shows every move’s evaluation.',
      'Nothing is due. If you like, pick a game and analyse it yourself first.',
      'A good habit: look at your game on your own before you ask me.'
    ],
    idle_bots: [
      'Nothing pressing. A game against one of the bots is good practice.',
      'If you want to play without pressure, the bots are always there.',
      'Try a bot at your level. It is a calm way to practise.'
    ],
    idle_encourage: [
      'You have been putting real effort into this. Keeping it up is what counts.',
      'Good, steady work lately. Consistency is the key.',
      'You are doing the right things. Keep coming back and it will show.'
    ],
    idle_rest: [
      'Everything is up to date. Go and enjoy your day.',
      'Nothing to do right now. Take a break, you earned it.',
      'All caught up. I’ll be here when you are back.'
    ]
  }
};

const CLASSIC_FEMALE: PersonaNudgeLines = {
  import_first: (remaining) =>
    `Let me show you how this works: I learn how you play from your own games. Import ${games(remaining)}, rated and with one time control, and I’ll start finding the patterns that keep coming back.`,
  first_coaching:
    'Our first coaching session! We’ll go through one of your games together, and I’ll help you find the answers yourself. I chose this game for us.',
  first_play:
    'There’s another way we can work together: you play a game against me, and I help you along as it happens. Want to try?',
  repeating: {
    picked_game: [
      'I looked through your new games and picked this one for you. There’s a lot we can learn from it.',
      'This is the one I’d love to go through with you. It has the most to show us.',
      'I chose this game for you. Its tactical moments are a great place to start.'
    ],
    practice: [
      'Your practice set is waiting. Let’s start there today.',
      'First things first: the practice I made for you. It’s built around your own games.',
      'Let’s do your practice set before anything else. You’ll feel the difference.'
    ],
    import_more: [
      'I haven’t seen a new game in a few days. Play some 10-minute rapid games on Lichess or Chess.com against real people, then import them here so we can keep improving.',
      'Let’s get some fresh games! A few 10-minute rapid games on Lichess or Chess.com, imported here, and I’ll have plenty to work with.',
      'Play a couple of 10-minute rapid games with people on Lichess or Chess.com, then bring them to me.'
    ],
    coach_game: [
      'It’s been a few days since our last session. Let’s go through this game together.',
      'I found a game worth talking about. Shall we?',
      'Let’s coach you on this one. I think you’ll enjoy what we find.'
    ],
    play_coach: [
      'We haven’t played in a while. Let’s have a game, and I’ll coach you along the way.',
      'Fancy a game against me? I’ll help you with every move.',
      'Let’s play one together. It’s the nicest way to practise.'
    ],
    idle_analyze: [
      'You can always look through a game on your own. It’s a great way to learn.',
      'Nothing is due. Why not pick a game and analyse it yourself first?',
      'Try looking at one of your games alone first. You’ll spot more than you think.'
    ],
    idle_bots: [
      'Nothing urgent. A relaxed game against a bot is lovely practice.',
      'The bots are always here if you want to play without pressure.',
      'Pick a bot around your level and just enjoy the game.'
    ],
    idle_encourage: [
      'You’ve been working so hard. Keeping it up is what matters most.',
      'I can see the effort you’re putting in. Consistency is the key.',
      'You’re doing wonderfully. Keep coming back and it will pay off.'
    ],
    idle_rest: [
      'You’re all caught up. Go enjoy your day!',
      'Nothing to do right now. Have a well-earned rest.',
      'All done for now. I’ll be right here when you’re back.'
    ]
  }
};

const PERSONA_NUDGES: Record<CoachPersona, PersonaNudgeLines> = {
  general: CLASSIC_MALE,
  general_female: CLASSIC_FEMALE,
  commander: {
    import_first: (remaining) =>
      `Orientation first. I train you from your own games, so I need them. Import ${games(remaining)}, rated, one time control. Then I find your weak points.`,
    first_coaching:
      'This is how we work: we take one of your games apart, move by move. I picked this one. First session starts now.',
    first_play: 'Next drill: you play a game against me, and I correct you as it happens. Report to the board.',
    repeating: {
      picked_game: [
        'I have reviewed the batch. This is the game we work on. I picked it for you.',
        'Target selected: this game. It has the most mistakes to fix.',
        'This one. Most tactical errors in the batch. We start here.'
      ],
      practice: [
        'Practice set assigned. That comes first. No excuses.',
        'Your practice is waiting. Finish it before anything else.',
        'Drills before anything else. Your practice set, now.'
      ],
      import_more: [
        'No new games in days. Play 10-minute rapid on Lichess or Chess.com against real opponents, then import them. That is an order.',
        'I can’t train you without material. Play 10-minute rapid games on Lichess or Chess.com and bring them here.',
        'Get back out there. 10-minute rapid, Lichess or Chess.com, real people. Then import.'
      ],
      coach_game: [
        'Too long since your last debrief. We go through this game now.',
        'This game needs a debrief. Let’s go.',
        'Here is your next assignment: we coach this game.'
      ],
      play_coach: [
        'You haven’t faced me in days. Sit down, we play, I coach.',
        'Game against me. Now. I’ll correct you as we go.',
        'Time to test you under fire. Play me.'
      ],
      idle_analyze: [
        'Nothing assigned. Analyse one of your games on your own. Discipline.',
        'Use the time: review a game yourself before I do.',
        'A good soldier studies alone too. Pick a game and analyse it.'
      ],
      idle_bots: [
        'No orders right now. Go play a bot and stay sharp.',
        'Idle hands lose games. Play a bot.',
        'Keep your edge: a game against a bot.'
      ],
      idle_encourage: [
        'You have been putting in the work. Keep it up. Consistency wins.',
        'Solid effort lately. Don’t let it slip.',
        'You show up and you work. That is what I want to see.'
      ],
      idle_rest: [
        'All tasks complete. Dismissed.',
        'Nothing left for today. Rest, then come back ready.',
        'Mission accomplished for now. At ease.'
      ]
    }
  },
  scholar: {
    import_first: (remaining) =>
      `Allow me to explain how this works: I learn from your own games, as a scholar learns from sources. Import ${games(remaining)}, rated and with one time control, and the patterns in your play will begin to reveal themselves.`,
    first_coaching:
      'Our first coaching session. We study one of your games together, and I will always explain why. I selected this game as our first text.',
    first_play:
      'There is another way to learn with me: we play a game, and I think aloud with you as it unfolds. Shall we begin?',
    repeating: {
      picked_game: [
        'Having examined your new games, I selected this one for you. It is the most instructive of them.',
        'Of all the games you brought, this one rewards study most. I chose it for you.',
        'I picked this game for you. Its tactical moments merit close reading.'
      ],
      practice: [
        'Your practice set awaits. It addresses precisely what we observed, so it comes first.',
        'Before anything else, the exercises I prepared. They were chosen from your own games.',
        'Let us begin with your practice set. Deliberate practice is how understanding grows.'
      ],
      import_more: [
        'I have had no new games to study for some days. Play a few 10-minute rapid games on Lichess or Chess.com against real people, then import them here.',
        'Fresh evidence, please. A few 10-minute rapid games on Lichess or Chess.com, imported here, will tell us much.',
        'Curious: no new games lately. Play 10-minute rapid on Lichess or Chess.com and bring them to me.'
      ],
      coach_game: [
        'Some days have passed since our last study. This game deserves our attention.',
        'I find this game rather instructive. Shall we examine it together?',
        'Let us study this game. I suspect it holds a useful lesson.'
      ],
      play_coach: [
        'We have not played together for some days. Let us play, and I will explain as we go.',
        'A game against me? I shall explain the reasoning behind every move.',
        'Let us play a game together. Understanding comes faster at the board.'
      ],
      idle_analyze: [
        'You may always study a game on your own. Form your own hypotheses first.',
        'Nothing is due. A quiet analysis of your own game is never wasted.',
        'Try analysing a game yourself before consulting me. It sharpens the mind.'
      ],
      idle_bots: [
        'Nothing pressing. A game against a bot is a fine experiment.',
        'The bots are always available for unhurried practice.',
        'Play a bot, and observe how your ideas hold up.'
      ],
      idle_encourage: [
        'I have noticed your diligence. Continuity is the key to mastery.',
        'Steady effort is the scholar’s secret, and you have it.',
        'Your commitment is showing. Keep at it.'
      ],
      idle_rest: [
        'Everything is in order. Go and enjoy the day.',
        'Nothing remains for now. Even scholars need rest.',
        'We are up to date. I shall be here when you return.'
      ]
    }
  },
  huntress: {
    import_first: (remaining) =>
      `Here is how the hunt works: I track your mistakes through your own games. Import ${games(remaining)}, rated, one time control, and I will pick up their trail.`,
    first_coaching:
      'Our first hunt: we go through one of your games and find what you missed. I picked this one. Nothing gets past me.',
    first_play: 'Another way we train: you play me, and I call out every chance as it appears. Ready?',
    repeating: {
      picked_game: [
        'I tracked through your new games. This is the one I picked for you: the most chances missed.',
        'Found it. This game has the most to hunt down. I picked it for you.',
        'This is my pick for you. Chances slipped away in it, and we go after them.'
      ],
      practice: [
        'Your practice set is ready. Hunt those down first.',
        'Practice first. Those are the exact weaknesses I tracked down.',
        'Before anything else: your practice set. Go.'
      ],
      import_more: [
        'The trail has gone cold. Play 10-minute rapid on Lichess or Chess.com against real people, then import the games.',
        'I need fresh tracks. A few 10-minute rapid games on Lichess or Chess.com, imported here.',
        'Go hunt some opponents: 10-minute rapid on Lichess or Chess.com. Then bring the games back.'
      ],
      coach_game: [
        'Days since our last hunt. This game has something hiding in it.',
        'I smell a missed tactic in this game. Let’s find it.',
        'Let’s coach this one. Stay sharp.'
      ],
      play_coach: [
        'You haven’t faced me in days. Play me, and I’ll show you what you miss.',
        'A game against me. Every chance you miss, I’ll point out.',
        'Let’s play. Keep your eyes open.'
      ],
      idle_analyze: [
        'Nothing to chase right now. Hunt through a game on your own.',
        'Go over a game yourself. See what you can catch before I do.',
        'Analyse one of your games alone. Train your eye.'
      ],
      idle_bots: [
        'Quiet for now. Sharpen up against a bot.',
        'Go hunt a bot. Good practice.',
        'Play a bot and attack. No hesitation.'
      ],
      idle_encourage: [
        'You keep showing up. That is how hunters get better.',
        'Relentless effort lately. Keep it that way.',
        'I see the work. Don’t stop now.'
      ],
      idle_rest: [
        'Nothing left to hunt today. Go rest.',
        'All clear. Come back sharp.',
        'The hunt is done for now. Enjoy your day.'
      ]
    }
  },
  shark: {
    import_first: (remaining) =>
      `Okay kid, here’s how this works: I learn your game from your games. Import ${games(remaining)}, rated, one time control, and I’ll find every sneaky bad habit you’ve got!`,
    first_coaching:
      'First coaching session, baby! We go through one of your games together and I tell it like it is. I picked this one. Let’s go!',
    first_play: 'Here’s the fun part: you play me, and I coach you live, trash talk included. You in?',
    repeating: {
      picked_game: [
        'I dug through your games, kid, and picked this one for you. It’s a juicy one!',
        'Ha! This one’s got the most blunders to laugh at. I picked it for you.',
        'My pick for you: this game. Lots of stuff to fix in here, trust me!'
      ],
      practice: [
        'Practice set’s ready, kid! Do that first, no dodging!',
        'Ha! Your homework’s waiting. Practice first, party later.',
        'Before anything else: your practice set. Chop chop!'
      ],
      import_more: [
        'Where are the games, kid? Go play some 10-minute rapid on Lichess or Chess.com against real people and bring ’em here!',
        'Days without a new game? Get on Lichess or Chess.com, play 10-minute rapid, import ’em. I’m bored!',
        'Go play some humans! 10-minute rapid on Lichess or Chess.com, then feed me the games.'
      ],
      coach_game: [
        'It’s been days! This game’s got something juicy in it. Let’s dig in.',
        'Ooh, I’ve got a game to roast. Yours! Let’s go.',
        'Let’s coach you on this one, kid. It’s gonna be fun.'
      ],
      play_coach: [
        'You been avoiding me? Come play, I’ll coach you and roast you at the same time!',
        'Game against me, kid! Live coaching, zero mercy.',
        'Let’s play! Try not to blunder your queen this time.'
      ],
      idle_analyze: [
        'Nothing on the menu. Go dig through a game yourself, kid.',
        'Try analysing a game on your own. Surprise me!',
        'Look at your own game first. Then I’ll tell you what you missed. Ha!'
      ],
      idle_bots: [
        'Quiet day! Go beat up a bot.',
        'Go play a bot, kid. They don’t trash talk back.',
        'Bots are waiting to get smashed. Go!'
      ],
      idle_encourage: [
        'Look at you, grinding away! Keep it up, kid.',
        'You’re putting in the work and I respect that. Consistency, baby!',
        'Hey, you’re actually getting better. Don’t stop now!'
      ],
      idle_rest: [
        'Nothing to do! Get outta here, go touch grass.',
        'All caught up. Go live your life, kid!',
        'You’re done! Scram, I’ll see you later.'
      ]
    }
  },
  sunzi: {
    import_first: (remaining) =>
      `First, understand the way we will work: know yourself, and you need not fear a hundred games. I learn you from your own games. Import ${games(remaining)}, rated and of one time control, and your patterns will show.`,
    first_coaching:
      'Our first study: we walk through one of your games together, as a general reviews a battle. I have chosen this one.',
    first_play:
      'There is another path: play against me, and I will guide you while the battle unfolds. Shall we begin?',
    repeating: {
      picked_game: [
        'I surveyed all of your new battles and chose this one for you. It holds the most lessons.',
        'The wise study the battle with the most to teach. I picked this one for you.',
        'Of these games, this is the one I have chosen for you. Its lessons are clearest.'
      ],
      practice: [
        'Your practice set is prepared. The wise attend to their weaknesses first.',
        'Before any other battle, the practice. It was drawn from your own games.',
        'Victory is prepared in training. Your practice set comes first.'
      ],
      import_more: [
        'No new battles for some days. Play 10-minute rapid games on Lichess or Chess.com against real opponents, and bring them here.',
        'Without new battles there is nothing to learn. Play 10-minute rapid on Lichess or Chess.com, then import.',
        'Seek new opponents: 10-minute rapid on Lichess or Chess.com. Then return with the games.'
      ],
      coach_game: [
        'Days have passed since our last study. This battle holds a lesson.',
        'Let us study this game. Every defeat and victory teaches.',
        'This game is worth reflection. Let us review it together.'
      ],
      play_coach: [
        'We have not met at the board for some days. Let us play, and I will guide you.',
        'A game against me? I will show you the path as we go.',
        'Let us play. The board teaches best in motion.'
      ],
      idle_analyze: [
        'Nothing is required of you. Study a game alone, in stillness.',
        'Reflect on one of your games on your own. Knowledge begins within.',
        'Analyse a game yourself first. The student who sees alone sees far.'
      ],
      idle_bots: [
        'All is calm. A game against a bot keeps the mind ready.',
        'Practise against a bot. Small battles prepare great ones.',
        'Play a bot, and test your plans without risk.'
      ],
      idle_encourage: [
        'Your effort is steady. The river wears down the stone by persistence.',
        'You have been diligent. Continuity is the key.',
        'Patience and effort together cannot be defeated. Continue.'
      ],
      idle_rest: [
        'All is in order. Rest; the wise know when not to fight.',
        'Nothing remains today. Go in peace.',
        'The campaign rests for now. Return when you are ready.'
      ]
    }
  },
  gambler: {
    import_first: (remaining) =>
      `House rules, since you’re new at my table: I learn your play from your own games. Import ${games(remaining)}, rated and one time control, and I’ll read you like an open hand.`,
    first_coaching:
      'Your first coaching session! We go through one of your games together, and I’ll show you where you bluffed badly. I picked this hand for you.',
    first_play: 'Here’s another game at my table: you play me, and I coach you as it happens. Care to take a seat?',
    repeating: {
      picked_game: [
        'I looked over every hand you just dealt me and picked this one for you. Best odds of learning something.',
        'This is the hand I’d replay with you, darling. I picked it for you.',
        'My pick for you: this game. Plenty of misplayed cards in it.'
      ],
      practice: [
        'Your practice set is dealt. Play that hand first.',
        'Before anything else: the practice. Safest bet you’ll make today.',
        'Practice first, darling. The house insists.'
      ],
      import_more: [
        'No new games in days? Play some 10-minute rapid on Lichess or Chess.com against real people, then bring me the cards.',
        'My table’s empty. Go play 10-minute rapid on Lichess or Chess.com and import what you win, or lose.',
        'Place some bets: 10-minute rapid on Lichess or Chess.com. Then show me the hands.'
      ],
      coach_game: [
        'It’s been a few days. I’ve got a feeling about this game. Let’s look.',
        'I’d bet there’s a lesson in this one. Shall we?',
        'Let’s coach this game. Odds are you’ll like what we find.'
      ],
      play_coach: [
        'You haven’t played me in days. Scared? Sit down, I’ll coach you as we go.',
        'A game against me? I’ll even give you tips while I win.',
        'Let’s play one. Winner gets bragging rights.'
      ],
      idle_analyze: [
        'Nothing on the table. Look over one of your games on your own.',
        'Study a hand yourself before I show you mine.',
        'Analyse a game alone. The best players read their own mistakes.'
      ],
      idle_bots: [
        'Quiet night. Go take a bot’s money.',
        'Play a bot. Low stakes, good practice.',
        'Warm up against a bot. The house won’t tell.'
      ],
      idle_encourage: [
        'You keep coming back to the table. Smartest bet there is.',
        'Real effort lately. Consistency always pays out.',
        'I like your style. Keep showing up.'
      ],
      idle_rest: [
        'Table’s closed for now. Go enjoy yourself.',
        'You’re all square. Cash out and take a break.',
        'Nothing left to play. Off you go, darling.'
      ]
    }
  }
};

const FIRST_TIME_KINDS: readonly FirstTimeKind[] = ['import_first', 'first_coaching', 'first_play'];

export interface NudgeLineContext {
  persona: CoachPersona;
  kind: CoachNudgeKind;
  /** For import_first: how many more games pattern tracking needs. */
  remaining?: number;
  /** For idle: which of the four things to say. */
  idleTopic?: IdleTopic;
  /** A number in [0, 1) that picks among the alternatives — Math.random(),
   * fixed per visit so the line doesn't change on every render. */
  pick: number;
}

/** The coach's line for the Games page's coach area. */
export function coachNudgeLine({
  persona,
  kind,
  remaining = 0,
  idleTopic = 'encourage',
  pick
}: NudgeLineContext): string {
  const lines = PERSONA_NUDGES[persona];
  if (kind === 'import_first') return lines.import_first(remaining);
  if ((FIRST_TIME_KINDS as readonly string[]).includes(kind))
    return lines[kind as Exclude<FirstTimeKind, 'import_first'>];
  const key: RepeatingKey =
    kind === 'idle' ? `idle_${idleTopic}` : (kind as Exclude<CoachNudgeKind, FirstTimeKind | 'idle'>);
  const variants = lines.repeating[key];
  return variants[Math.floor(pick * variants.length)] ?? variants[0]!;
}

/** After a bulk import, the coach presenting the game they picked to coach
 * on (RecommendedGameCard). Repeats with every import, so it has alternatives. */
export function pickedGameLine(persona: CoachPersona, pick: number): string {
  const variants = PERSONA_NUDGES[persona].repeating.picked_game;
  return variants[Math.floor(pick * variants.length)] ?? variants[0]!;
}
