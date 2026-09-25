import { BUG_REPORT_LIMITS, BUG_REPORT_MAX_LENGTH } from '@freechesscoach/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { describeApiError } from '../../api/client.js';
import { Modal } from '../../components/Modal.js';
import { useSendBugReport } from '../../hooks/useSendBugReport.js';
import './BugReportModal.css';

/** "Report a bug" (account menu, every page): what happened, and what the
 * person expected instead. The page they are on is sent along (path only),
 * so a report can be reproduced. The server rate-limits it per user
 * (BUG_REPORT_LIMITS) and its own message is shown when a limit is hit. */
export function BugReportModal({ onClose }: { onClose: () => void }): ReactNode {
  const { pathname } = useLocation();
  const send = useSendBugReport();
  const [whatHappened, setWhatHappened] = useState('');
  const [whatExpected, setWhatExpected] = useState('');

  function submit(event: FormEvent): void {
    event.preventDefault();
    send.mutate({ whatHappened, whatExpected, pagePath: pathname });
  }

  return (
    <Modal title="Report a bug" onClose={onClose}>
      {send.isSuccess ? (
        <div className="bug-report">
          <p role="status"><strong>Thank you.</strong> Your report was sent. Finding these together is how we make the platform better.</p>
          <div className="bug-report__actions">
            <button type="button" className="btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <form className="bug-report" onSubmit={submit}>
          <label htmlFor="bug-what-happened">What happened?</label>
          <textarea
            id="bug-what-happened"
            value={whatHappened}
            onChange={(event) => setWhatHappened(event.target.value)}
            maxLength={BUG_REPORT_MAX_LENGTH}
            rows={4}
            placeholder="For example: I moved my knight and the board went blank."
            required
          />
          <label htmlFor="bug-what-expected">What did you expect to happen?</label>
          <textarea
            id="bug-what-expected"
            value={whatExpected}
            onChange={(event) => setWhatExpected(event.target.value)}
            maxLength={BUG_REPORT_MAX_LENGTH}
            rows={4}
            placeholder="For example: The coach should have answered my move."
            required
          />
          <p className="bug-report__hint">
            We attach the page you are on ({pathname}) and your browser type. Please don’t include passwords or keys.
            You can send up to {BUG_REPORT_LIMITS.perWindow} reports every {BUG_REPORT_LIMITS.windowMinutes} minutes and {BUG_REPORT_LIMITS.perDay} a day.
          </p>
          {send.isError && <p role="alert" className="bug-report__error">{describeApiError(send.error)}</p>}
          <div className="bug-report__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={send.isPending}>
              {send.isPending ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
