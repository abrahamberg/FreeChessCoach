import type { ReactNode } from 'react';

export const INTAKE_TEXT_EXAMPLE = `Classical Scotch:
# Black puts the bishop on c5 and White keeps the centre
1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 5. Be3 Qf6
---
Schmidt variation:
# Black strikes back at the knight
4. - Nf6 5. Nxc6 bxc6 6. e5 Qe7`;

/** How to write the moves: a standard PGN works as it is; this adds
 * sections for the lines a creator wants to teach. */
export function IntakeTextHelp(): ReactNode {
  return (
    <details className="course-new__help">
      <summary>How to write the moves</summary>
      <p>
        Paste a PGN with variations in brackets, or write one section per line, divided by a line of <code>---</code>.
      </p>
      <pre>{INTAKE_TEXT_EXAMPLE}</pre>
      <ul>
        <li>
          A line ending in <code>:</code> is the section’s name; a line starting with <code>#</code> says what it is for.
        </li>
        <li>
          A later section starts with the move number it branches at: <code>8. Bd5</code> is White’s 8th move, <code>8... Qf6</code> Black’s 8th.
          Write <code>8. - Qf6</code> when you only want to give Black’s move.
        </li>
        <li>
          <code>{'{ a comment }'}</code>, <code>;</code> and <code>#</code> after a move comment on it.
        </li>
        <li>
          Marks after a move steer the course: <code>@key</code> (the point, focus here), <code>@quiz</code> (ask the learner to find this move),{' '}
          <code>@slow</code> and <code>@fast</code> (the move takes its time, or says nothing and goes quickly), <code>@reel</code> (the moment for the
          reel). On a line of their own at the top of a section, <code>@fast</code> and <code>@slow</code> cover the whole section.
        </li>
        <li>
          Glyphs count too: <code>!</code> and <code>!!</code> make a move key, and the victim’s <code>?</code> or <code>??</code> marks a trap’s bait.
        </li>
      </ul>
    </details>
  );
}
