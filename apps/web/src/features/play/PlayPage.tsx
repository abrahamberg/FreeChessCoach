import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, MessageCircleIcon, PlayCircleIcon, type IconProps } from '../../components/Icon.js';
import './PlayPage.css';

interface PlayDestination {
  to: string;
  Icon: (props: IconProps) => ReactNode;
  title: string;
  description: string;
}

const DESTINATIONS: PlayDestination[] = [
  {
    to: '/play/new',
    Icon: MessageCircleIcon,
    title: 'Play with Coach',
    description: 'Get live guidance while you play, not just after the fact.'
  },
  {
    to: '/play-bot/new',
    Icon: PlayCircleIcon,
    title: 'Play a Bot',
    description: 'Choose your opponent and time control.'
  }
];

/** Daniel's IA feedback: playing chess and studying chess are two different
 * jobs. This is the home for the former ("Play a live game") — GamesPage
 * covers the latter (reviewing/coaching games already played) and no longer
 * spends its header on two giant CTAs that competed with the list itself
 * for space. */
export function PlayPage(): ReactNode {
  return (
    <div className="page play-page">
      <header className="play-page__header">
        <h1>Play</h1>
        <p className="play-page__description">Play a live game, with or without the coach watching.</p>
      </header>

      <div className="play-page__destinations">
        {DESTINATIONS.map(({ to, Icon, title, description }) => (
          <Link key={to} to={to} className="card play-page__destination">
            <Icon width={26} height={26} className="play-page__destination-icon" />
            <div className="play-page__destination-body">
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <ArrowRightIcon width={18} height={18} className="play-page__destination-arrow" />
          </Link>
        ))}
      </div>
    </div>
  );
}
